import { Op, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { resolveTargetBusinessUnitId } from "../../../../../core/rbac/businessUnitScope";
import { isOutOfWriteScope, resolveWriteScope } from "../../../../../core/rbac/writeScope";
import { nowUtc } from "../../../../../utils/dateUtils";
import { IToken } from "../../../../interfaces/IToken.interface";
import type { QuotationModel } from "../../../quotation/model/quotation.model";
import type { StockDocumentModel, WarehouseModel } from "../../../inventory/model/inventory.models";
import { canWriteWarehouse, colorKeyOf } from "../../../inventory/services/shared/inventory_shared";
import { round3 } from "../../../inventory/services/shared/stock_engine";
import type {
  DispatchGuideAttributes,
  DispatchGuideLineAttributes,
  DispatchGuideRelatedDocumentAttributes,
  DispatchGuideTransportAttributes,
} from "../../model/dispatch_guide.models";
import type { GuideInput } from "../../types/dispatch_guide.types";
import { assertCompanyHasGuides, blankToNull, resolveCompanyForGuides } from "../shared/guide_company";
import { assertWithinOrdered } from "./dispatch_control";

// De dónde sale una guía y a qué empresa/tienda pertenece. Se resuelve
// SIEMPRE desde la sesión y los registros de origen, nunca desde lo que mande
// el body (CLAUDE.md §10 y §11.1).
export interface GuideContext {
  companyId: number;
  businessUnitId: number | null;
  quotation: QuotationModel | null;
  transfer: StockDocumentModel | null;
}

// Una guía se arma desde una cotización Lista para entregar o Entregada (plan §9.4).
export const GUIDE_QUOTATION_STATUSES = ["ready", "delivered"];

// Cotización bloqueada (FOR UPDATE) para que dos guías de la misma cotización
// no pasen a la vez el control de lo despachado.
export const lockQuotationForGuide = async (quotationId: number, user: IToken, transaction: Transaction): Promise<QuotationModel> => {
  const quotation = await DataBase.instance.quotation.findByPk(quotationId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!quotation || quotation.is_deleted) throw new AppError(404, "La cotización no existe");
  if (isOutOfWriteScope(quotation, resolveWriteScope(user))) throw new AppError(404, "La cotización no existe");
  return quotation;
};

export const assertQuotationReadyForGuide = (quotation: QuotationModel): void => {
  if (GUIDE_QUOTATION_STATUSES.includes(quotation.status)) return;
  throw new AppError(
    409,
    "La guía se arma desde una cotización Lista para entregar o Entregada",
    undefined,
    "QUOTATION_NOT_READY"
  );
};

// Transferencia de almacén (motivo 04): la opera quien opera el almacén de
// origen. Una transferencia tiene a lo sumo una guía activa.
export const lockTransferForGuide = async (
  documentId: number,
  user: IToken,
  excludeGuideId: number | null,
  transaction: Transaction
): Promise<{ transfer: StockDocumentModel; origin: WarehouseModel }> => {
  const transfer = await DataBase.instance.stock_document.findByPk(documentId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!transfer || transfer.doc_type !== "transfer") throw new AppError(404, "La transferencia no existe");
  const origin = await DataBase.instance.warehouse.findByPk(transfer.warehouse_id, { transaction });
  if (!origin || !canWriteWarehouse(user, origin)) throw new AppError(404, "La transferencia no existe");
  if (transfer.status === "cancelled") throw new AppError(409, "La transferencia está anulada", undefined, "TRANSFER_CANCELLED");

  const existing = await DataBase.instance.dispatch_guide.findOne({
    where: { stock_document_id: transfer.id, status: { [Op.ne]: "voided" }, id: { [Op.ne]: excludeGuideId ?? 0 } },
    attributes: ["id"],
    transaction,
  });
  if (existing) throw new AppError(409, "Esta transferencia ya tiene una guía", { guideId: Number(existing.id) }, "TRANSFER_HAS_GUIDE");
  return { transfer, origin };
};

// Contexto de una guía NUEVA: desde una cotización, una transferencia o de cero.
export const resolveNewGuideContext = async (input: GuideInput, user: IToken, transaction: Transaction): Promise<GuideContext> => {
  if (input.quotation_id) {
    const quotation = await lockQuotationForGuide(input.quotation_id, user, transaction);
    assertQuotationReadyForGuide(quotation);
    const companyId = Number(quotation.company_id);
    if (user.isSystem) await assertCompanyHasGuides(companyId, transaction);
    const businessUnitId = quotation.business_unit_id === null ? null : Number(quotation.business_unit_id);
    return { companyId, businessUnitId, quotation, transfer: null };
  }

  if (input.stock_document_id) {
    const { transfer, origin } = await lockTransferForGuide(input.stock_document_id, user, null, transaction);
    const companyId = Number(transfer.company_id);
    if (user.isSystem) await assertCompanyHasGuides(companyId, transaction);
    const businessUnitId = origin.business_unit_id === null ? null : Number(origin.business_unit_id);
    return { companyId, businessUnitId, quotation: null, transfer };
  }

  const companyId = await resolveCompanyForGuides(user, input.company_id, "guías de remisión");
  const businessUnitId = await resolveTargetBusinessUnitId(user, input.business_unit_id, companyId);
  return { companyId, businessUnitId, quotation: null, transfer: null };
};

type GuideFields = Omit<
  DispatchGuideAttributes,
  | "id"
  | "company_id"
  | "business_unit_id"
  | "emission_mode"
  | "series"
  | "number"
  | "status"
  | "issue_date"
  | "quotation_id"
  | "stock_document_id"
  | "registered_at"
  | "registered_by"
  | "voided_at"
  | "voided_by"
  | "void_reason"
  | "created_by"
  | "created_at"
  | "updated_by"
  | "updated_at"
>;

type ChildAudit = "id" | "company_id" | "guide_id" | "created_by" | "created_at" | "updated_by" | "updated_at";

export interface GuideContent {
  fields: GuideFields;
  lines: Omit<DispatchGuideLineAttributes, ChildAudit>[];
  transports: Omit<DispatchGuideTransportAttributes, ChildAudit>[];
  related: Omit<DispatchGuideRelatedDocumentAttributes, ChildAudit>[];
}

const notFound = (label: string): never => {
  throw new AppError(404, `${label} no existe`);
};

// Almacén de la empresa (nunca el virtual "En tránsito"). El de partida tiene
// que ser uno que el usuario opere: de ahí sale la mercadería.
const findGuideWarehouse = async (
  id: number | null | undefined,
  companyId: number,
  user: IToken,
  mode: "origin" | "destination",
  transaction: Transaction
): Promise<WarehouseModel | null> => {
  if (!id) return null;
  const label = mode === "origin" ? "El almacén de partida" : "El almacén de llegada";
  const warehouse = await DataBase.instance.warehouse.findByPk(id, { transaction });
  if (!warehouse || warehouse.is_transit || Number(warehouse.company_id) !== companyId) return notFound(label);
  if (mode === "origin" && !canWriteWarehouse(user, warehouse)) return notFound(label);
  return warehouse;
};

const resolveCarrier = async (input: GuideInput, companyId: number, transaction: Transaction) => {
  const empty = { carrier_supplier_id: null, carrier_ruc: null, carrier_name: null, carrier_mtc_registration: null };
  if (input.transport_mode !== "public" || !input.carrier_supplier_id) return empty;
  const supplier = await DataBase.instance.supplier.findByPk(input.carrier_supplier_id, { transaction });
  if (!supplier || Number(supplier.company_id) !== companyId || !supplier.active) return notFound("El transportista");
  if (!supplier.is_carrier) throw new AppError(400, "El proveedor elegido no está marcado como transportista", undefined, "NOT_A_CARRIER");
  return {
    carrier_supplier_id: Number(supplier.id),
    carrier_ruc: supplier.document_number,
    carrier_name: supplier.name,
    carrier_mtc_registration: supplier.mtc_registration,
  };
};

// Vehículos y conductores del catálogo (el primero es el principal). Solo en
// transporte privado y sin vehículo liviano (M1/L no declara placa ni conductor).
const resolveTransports = async (input: GuideInput, companyId: number, transaction: Transaction): Promise<GuideContent["transports"]> => {
  if (input.transport_mode !== "private" || input.light_vehicle) return [];
  const vehicleIds = [...new Set(input.vehicle_ids ?? [])];
  const driverIds = [...new Set(input.driver_ids ?? [])];
  const [vehicles, drivers] = await Promise.all([
    vehicleIds.length
      ? DataBase.instance.transport_vehicle.findAll({ where: { id: { [Op.in]: vehicleIds }, company_id: companyId, active: true }, transaction })
      : Promise.resolve([]),
    driverIds.length
      ? DataBase.instance.transport_driver.findAll({ where: { id: { [Op.in]: driverIds }, company_id: companyId, active: true }, transaction })
      : Promise.resolve([]),
  ]);
  if (vehicles.length !== vehicleIds.length) notFound("Un vehículo elegido");
  if (drivers.length !== driverIds.length) notFound("Un conductor elegido");
  const vehicleById = new Map(vehicles.map((vehicle) => [Number(vehicle.id), vehicle]));
  const driverById = new Map(drivers.map((driver) => [Number(driver.id), driver]));

  const vehicleRows = vehicleIds.map((id, index) => {
    const vehicle = vehicleById.get(id)!;
    return {
      kind: "vehicle" as const,
      vehicle_id: id,
      driver_id: null,
      plate: vehicle.plate,
      driver_doc_type: null,
      driver_doc_number: null,
      driver_first_names: null,
      driver_last_names: null,
      license_number: null,
      is_main: index === 0,
    };
  });
  const driverRows = driverIds.map((id, index) => {
    const driver = driverById.get(id)!;
    return {
      kind: "driver" as const,
      vehicle_id: null,
      driver_id: id,
      plate: null,
      driver_doc_type: driver.doc_type,
      driver_doc_number: driver.doc_number,
      driver_first_names: driver.first_names,
      driver_last_names: driver.last_names,
      license_number: driver.license_number,
      is_main: index === 0,
    };
  });
  return [...vehicleRows, ...driverRows];
};

const resolveLines = async (input: GuideInput, context: GuideContext, transaction: Transaction): Promise<GuideContent["lines"]> => {
  const productIds = [...new Set(input.lines.map((line) => line.product_id).filter((id): id is number => Boolean(id)))];
  const products = productIds.length
    ? await DataBase.instance.product.findAll({
        where: { id: { [Op.in]: productIds }, company_id: context.companyId },
        attributes: ["id", "sku"],
        transaction,
      })
    : [];
  if (products.length !== productIds.length) notFound("Un producto de la guía");
  const skuById = new Map(products.map((product) => [Number(product.id), product.sku]));

  // Un ítem que no es de la cotización de la guía se descarta (solo informativo).
  const quotationItemIds = new Set<number>();
  if (context.quotation) {
    const items = await DataBase.instance.quotation_item.findAll({
      where: { quotation_id: context.quotation.id },
      attributes: ["id"],
      transaction,
    });
    items.forEach((item) => quotationItemIds.add(Number(item.id)));
  }

  return input.lines.map((line, index) => {
    const productId = line.product_id ? Number(line.product_id) : null;
    const itemId = line.quotation_item_id ? Number(line.quotation_item_id) : null;
    return {
      line_no: index + 1,
      product_id: productId,
      quotation_item_id: itemId !== null && quotationItemIds.has(itemId) ? itemId : null,
      product_code: blankToNull(line.product_code) ?? (productId === null ? null : skuById.get(productId) ?? null),
      description: line.description.trim(),
      color: colorKeyOf(line.color),
      quantity: String(round3(Number(line.quantity))),
      unit_code: (blankToNull(line.unit_code) ?? "NIU").toUpperCase(),
    };
  });
};

// Valida las referencias del formulario y arma lo que se guarda. Un borrador
// puede quedar incompleto; lo obligatorio para SUNAT se exige al registrar.
export const buildGuideContent = async (
  input: GuideInput,
  context: GuideContext,
  user: IToken,
  excludeGuideId: number | null,
  transaction: Transaction
): Promise<GuideContent> => {
  const { companyId, quotation, transfer } = context;
  // Una guía de transferencia siempre es motivo 04, del origen al destino de la transferencia.
  const originId = transfer ? Number(transfer.warehouse_id) : input.origin_warehouse_id;
  const destinationId = transfer ? transfer.target_warehouse_id : input.destination_warehouse_id;
  const [origin, destination] = await Promise.all([
    findGuideWarehouse(originId, companyId, user, "origin", transaction),
    findGuideWarehouse(destinationId, companyId, user, "destination", transaction),
  ]);

  const clientId = quotation ? Number(quotation.client_id) : input.client_id ?? null;
  if (clientId !== null && !quotation) {
    const client = await DataBase.instance.client.findByPk(clientId, { attributes: ["id", "company_id", "is_deleted"], transaction });
    if (!client || client.is_deleted || Number(client.company_id) !== companyId) notFound("El cliente");
  }

  const [carrier, transports, lines] = await Promise.all([
    resolveCarrier(input, companyId, transaction),
    resolveTransports(input, companyId, transaction),
    resolveLines(input, context, transaction),
  ]);
  if (quotation) {
    await assertWithinOrdered(
      Number(quotation.id),
      lines.map((line) => ({ productId: line.product_id, color: line.color, quantity: Number(line.quantity) })),
      excludeGuideId,
      transaction
    );
  }

  const isPrivate = input.transport_mode === "private";
  return {
    fields: {
      transfer_start_date: input.transfer_start_date || null,
      reason_code: transfer ? "04" : input.reason_code,
      reason_note: blankToNull(input.reason_note),
      transport_mode: input.transport_mode,
      light_vehicle: isPrivate && Boolean(input.light_vehicle),
      gross_weight_kg: input.gross_weight_kg === null || input.gross_weight_kg === undefined ? null : String(round3(input.gross_weight_kg)),
      packages: input.packages ?? null,
      origin_warehouse_id: origin ? Number(origin.id) : null,
      origin_address: blankToNull(input.origin_address) ?? origin?.address ?? null,
      origin_ubigeo: blankToNull(input.origin_ubigeo) ?? origin?.ubigeo ?? null,
      origin_establishment_code: blankToNull(input.origin_establishment_code) ?? origin?.sunat_establishment_code ?? null,
      destination_warehouse_id: destination ? Number(destination.id) : null,
      destination_address: blankToNull(input.destination_address) ?? destination?.address ?? null,
      destination_ubigeo: blankToNull(input.destination_ubigeo) ?? destination?.ubigeo ?? null,
      destination_establishment_code:
        blankToNull(input.destination_establishment_code) ?? destination?.sunat_establishment_code ?? null,
      client_id: clientId,
      recipient_doc_type: blankToNull(input.recipient_doc_type),
      recipient_doc_number: blankToNull(input.recipient_doc_number),
      recipient_name: blankToNull(input.recipient_name),
      ...carrier,
      notes: blankToNull(input.notes),
    },
    lines,
    transports,
    related: (input.related_documents ?? []).map((document) => ({
      doc_type: document.doc_type,
      series_number: document.series_number.trim().toUpperCase(),
      issuer_ruc: blankToNull(document.issuer_ruc),
    })),
  };
};

// Reemplaza líneas, transporte y documentos relacionados de la guía.
export const replaceGuideChildren = async (
  guideId: number,
  companyId: number,
  content: GuideContent,
  actorId: number,
  transaction: Transaction
): Promise<void> => {
  const where = { guide_id: guideId };
  await Promise.all([
    DataBase.instance.dispatch_guide_line.destroy({ where, transaction }),
    DataBase.instance.dispatch_guide_transport.destroy({ where, transaction }),
    DataBase.instance.dispatch_guide_related_document.destroy({ where, transaction }),
  ]);
  const now = nowUtc();
  const audit = { id: 0, company_id: companyId, guide_id: guideId, created_by: actorId, created_at: now, updated_by: actorId, updated_at: now };
  if (content.lines.length) await DataBase.instance.dispatch_guide_line.bulkCreate(content.lines.map((line) => ({ ...audit, ...line })), { transaction });
  if (content.transports.length) {
    await DataBase.instance.dispatch_guide_transport.bulkCreate(content.transports.map((row) => ({ ...audit, ...row })), { transaction });
  }
  if (content.related.length) {
    await DataBase.instance.dispatch_guide_related_document.bulkCreate(content.related.map((row) => ({ ...audit, ...row })), { transaction });
  }
};

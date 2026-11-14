import { Op } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { isOutOfWriteScope, resolveWriteScope } from "../../../../../core/rbac/writeScope";
import { todayInBusinessTz } from "../../../../../utils/dateUtils";
import { IToken } from "../../../../interfaces/IToken.interface";
import { canWriteWarehouse, colorKeyOf } from "../../../inventory/services/shared/inventory_shared";
import { documentNumberText } from "../../../inventory/services/documents/document_shared";
import { round3 } from "../../../inventory/services/shared/stock_engine";
import type { WarehouseModel } from "../../../inventory/model/inventory.models";
import type { GuidePrefillDto, PrefillLineDto } from "../../types/dispatch_guide.types";
import { assertCompanyHasGuides } from "../shared/guide_company";
import { quotationDispatchBalances } from "./dispatch_control";
import { assertQuotationReadyForGuide } from "./guide_input";

// SUNAT (catálogo 06): 11 dígitos es RUC, 8 es DNI. El cliente guarda su tipo
// en un catálogo propio, así que se deduce del número; si no encaja, lo elige
// la persona en el formulario.
const sunatDocTypeOf = (documentNumber: string | null): string | null => {
  const digits = documentNumber?.trim() ?? "";
  if (/^\d{11}$/.test(digits)) return "6";
  if (/^\d{8}$/.test(digits)) return "1";
  return null;
};

const storeName = async (businessUnitId: number | null): Promise<string | null> => {
  if (businessUnitId === null) return null;
  const store = await DataBase.instance.business_unit.findByPk(businessUnitId, { attributes: ["business_code"] });
  return store?.business_code ?? null;
};

const pointOf = (warehouse: WarehouseModel | null) => ({
  address: warehouse?.address ?? null,
  ubigeo: warehouse?.ubigeo ?? null,
  establishment: warehouse?.sunat_establishment_code ?? null,
});

// Avisos para que la persona complete antes de emitir (no frenan el borrador).
const pointWarnings = (label: string, point: ReturnType<typeof pointOf>): string[] => [
  ...(point.address ? [] : [`Falta la dirección del punto de ${label}.`]),
  ...(point.ubigeo ? [] : [`Falta el ubigeo del punto de ${label}.`]),
];

/**
 * Precarga desde una cotización (plan §9.4): cliente como destinatario, su
 * dirección como llegada, el almacén predeterminado de la tienda como partida
 * y, por producto y color, lo que falta despachar (lo pedido menos lo que ya
 * llevan otras guías no anuladas). Motivo 01 (venta).
 */
const prefillFromQuotation = async (quotationId: number, user: IToken): Promise<GuidePrefillDto> => {
  const quotation = await DataBase.instance.quotation.findByPk(quotationId);
  if (!quotation || quotation.is_deleted || isOutOfWriteScope(quotation, resolveWriteScope(user))) throw new AppError(404, "La cotización no existe");
  assertQuotationReadyForGuide(quotation);
  const companyId = Number(quotation.company_id);
  await assertCompanyHasGuides(companyId);
  const businessUnitId = quotation.business_unit_id === null ? null : Number(quotation.business_unit_id);

  const [client, origin, items, balances] = await Promise.all([
    DataBase.instance.client.findByPk(quotation.client_id, { attributes: ["id", "name", "document_number", "address"] }),
    businessUnitId === null
      ? Promise.resolve(null)
      : DataBase.instance.warehouse.findOne({ where: { business_unit_id: businessUnitId, is_default: true, active: true, is_transit: false } }),
    DataBase.instance.quotation_item.findAll({ where: { quotation_id: quotation.id, is_excluded: false }, order: [["id", "asc"]] }),
    quotationDispatchBalances(Number(quotation.id), null),
  ]);
  const products = await DataBase.instance.product.findAll({
    where: { id: { [Op.in]: [...new Set(items.map((item) => Number(item.product_id)))] } },
    attributes: ["id", "name", "sku"],
  });
  const productById = new Map(products.map((product) => [Number(product.id), product]));

  // Lo que falta se reparte entre los ítems del mismo producto y color, en orden.
  const remaining = new Map([...balances.entries()].map(([key, balance]) => [key, round3(balance.ordered - balance.dispatched)]));
  const lines: PrefillLineDto[] = items.map((item) => {
    const color = colorKeyOf(item.color);
    const key = `${item.product_id}|${color}`;
    const balance = balances.get(key);
    const pending = Math.max(0, Math.min(Number(item.quantity), remaining.get(key) ?? 0));
    remaining.set(key, round3((remaining.get(key) ?? 0) - pending));
    const product = productById.get(Number(item.product_id));
    return {
      product_id: Number(item.product_id),
      quotation_item_id: Number(item.id),
      product_code: product?.sku ?? null,
      description: `${product?.name ?? "Producto"}${color ? ` (${color})` : ""}`,
      color,
      quantity: pending,
      unit_code: "NIU",
      ordered: balance?.ordered ?? Number(item.quantity),
      dispatched: balance?.dispatched ?? 0,
      pending,
    };
  });
  const pendingLines = lines.filter((line) => (line.pending ?? 0) > 0);

  const from = pointOf(origin);
  const warnings = [
    ...(origin ? [] : ["La tienda de la cotización no tiene almacén predeterminado: completa el punto de partida."]),
    ...pointWarnings("partida", from),
    ...(client?.address ? [] : ["El cliente no tiene dirección: completa el punto de llegada."]),
    "Completa el ubigeo del punto de llegada.",
    ...(pendingLines.length === 0 ? ["Todo lo de la cotización ya está en otras guías."] : []),
  ];

  return {
    company_id: companyId,
    business_unit_id: businessUnitId,
    business_unit_name: await storeName(businessUnitId),
    source: { kind: "quotation", id: Number(quotation.id), label: `Cotización #${quotation.id}` },
    quotation_id: Number(quotation.id),
    reason_code: "01",
    transfer_start_date: todayInBusinessTz(),
    transport_mode: "private",
    light_vehicle: false,
    origin_warehouse_id: origin ? Number(origin.id) : null,
    origin_address: from.address,
    origin_ubigeo: from.ubigeo,
    origin_establishment_code: from.establishment,
    destination_address: client?.address ?? null,
    client_id: client ? Number(client.id) : null,
    recipient_doc_type: sunatDocTypeOf(client?.document_number ?? null),
    recipient_doc_number: client?.document_number ?? null,
    // A nombre de quien se factura, si la cotización lo tiene.
    recipient_name: quotation.billing_name ?? client?.name ?? null,
    lines: pendingLines,
    warnings,
  };
};

/**
 * Precarga desde una transferencia de almacén (motivo 04): partida y llegada
 * son los dos almacenes; el destinatario es la propia empresa (RUC).
 */
const prefillFromTransfer = async (documentId: number, user: IToken): Promise<GuidePrefillDto> => {
  const transfer = await DataBase.instance.stock_document.findByPk(documentId);
  if (!transfer || transfer.doc_type !== "transfer") throw new AppError(404, "La transferencia no existe");
  const [origin, destination] = await Promise.all([
    DataBase.instance.warehouse.findByPk(transfer.warehouse_id),
    transfer.target_warehouse_id === null ? Promise.resolve(null) : DataBase.instance.warehouse.findByPk(transfer.target_warehouse_id),
  ]);
  if (!origin || !canWriteWarehouse(user, origin)) throw new AppError(404, "La transferencia no existe");
  if (transfer.status === "cancelled") throw new AppError(409, "La transferencia está anulada", undefined, "TRANSFER_CANCELLED");
  const companyId = Number(transfer.company_id);
  await assertCompanyHasGuides(companyId);

  const existing = await DataBase.instance.dispatch_guide.findOne({
    where: { stock_document_id: transfer.id, status: { [Op.ne]: "voided" } },
    attributes: ["id"],
  });
  if (existing) throw new AppError(409, "Esta transferencia ya tiene una guía", { guideId: Number(existing.id) }, "TRANSFER_HAS_GUIDE");

  const [company, documentLines] = await Promise.all([
    DataBase.instance.company.findByPk(companyId, { attributes: ["ruc", "business_name"] }),
    DataBase.instance.stock_document_line.findAll({ where: { document_id: transfer.id }, order: [["id", "asc"]] }),
  ]);
  const products = await DataBase.instance.product.findAll({
    where: { id: { [Op.in]: [...new Set(documentLines.map((line) => Number(line.product_id)))] } },
    attributes: ["id", "name", "sku"],
  });
  const productById = new Map(products.map((product) => [Number(product.id), product]));
  const businessUnitId = origin.business_unit_id === null ? null : Number(origin.business_unit_id);
  const from = pointOf(origin);
  const to = pointOf(destination);

  return {
    company_id: companyId,
    business_unit_id: businessUnitId,
    business_unit_name: await storeName(businessUnitId),
    source: { kind: "transfer", id: Number(transfer.id), label: `Transferencia ${documentNumberText(transfer)}` },
    stock_document_id: Number(transfer.id),
    reason_code: "04",
    transfer_start_date: todayInBusinessTz(),
    transport_mode: "private",
    light_vehicle: false,
    origin_warehouse_id: Number(origin.id),
    origin_address: from.address,
    origin_ubigeo: from.ubigeo,
    origin_establishment_code: from.establishment,
    destination_warehouse_id: destination ? Number(destination.id) : null,
    destination_address: to.address,
    destination_ubigeo: to.ubigeo,
    destination_establishment_code: to.establishment,
    recipient_doc_type: company?.ruc ? "6" : null,
    recipient_doc_number: company?.ruc ?? null,
    recipient_name: company?.business_name ?? null,
    lines: documentLines.map((line) => {
      const product = productById.get(Number(line.product_id));
      const quantity = Number(line.quantity);
      return {
        product_id: Number(line.product_id),
        product_code: product?.sku ?? null,
        description: `${product?.name ?? "Producto"}${line.color_key ? ` (${line.color_key})` : ""}`,
        color: line.color_key,
        quantity,
        unit_code: "NIU",
        ordered: null,
        dispatched: null,
        pending: null,
      };
    }),
    warnings: [
      ...pointWarnings("partida", from),
      ...pointWarnings("llegada", to),
      ...(from.establishment && to.establishment ? [] : ["Traslado entre establecimientos: indica el código de establecimiento SUNAT de los dos almacenes."]),
    ],
  };
};

export const prefillGuideService = async (params: { quotationId?: number; transferId?: number }, user: IToken): Promise<GuidePrefillDto> => {
  if (params.quotationId) return prefillFromQuotation(params.quotationId, user);
  if (params.transferId) return prefillFromTransfer(params.transferId, user);
  throw new AppError(400, "Indica la cotización o la transferencia de la que sale la guía");
};

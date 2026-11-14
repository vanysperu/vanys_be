import { Op, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { resolveBusinessUnitFilter } from "../../../../../core/rbac/businessUnitScope";
import { isOutOfWriteScope, resolveWriteScope } from "../../../../../core/rbac/writeScope";
import { utcToBusinessParts } from "../../../../../utils/dateUtils";
import { IToken } from "../../../../interfaces/IToken.interface";
import type { DispatchGuideModel } from "../../model/dispatch_guide.models";
import type { GuideDto, GuideSummaryDto } from "../../types/dispatch_guide.types";
import { GUIDE_REASONS, RELATED_DOC_TYPES } from "../../types/dispatch_guide.types";
import { documentNumberText } from "../../../inventory/services/documents/document_shared";

// "T001-123"; null mientras la guía es borrador (el número lo da SUNAT).
export const guideNumberText = (guide: Pick<DispatchGuideModel, "series" | "number">): string | null =>
  guide.series && guide.number ? `${guide.series}-${guide.number}` : null;

// Etiqueta corta para mensajes: el número o "el borrador #id".
export const guideLabel = (guide: Pick<DispatchGuideModel, "id" | "series" | "number">): string =>
  guideNumberText(guide) ?? `el borrador #${guide.id}`;

// Alcance de lectura (CLAUDE.md §11.1): la empresa del usuario y, si está
// atado a una tienda sin "ver todas las tiendas", solo su tienda.
const canReadGuide = (user: IToken, guide: DispatchGuideModel): boolean => {
  if (user.isSystem) return true;
  if (Number(guide.company_id) !== user.companyId) return false;
  const storeFilter = resolveBusinessUnitFilter(user);
  if (storeFilter === undefined) return true;
  return Number(guide.business_unit_id) === storeFilter;
};

// Guía para leer o escribir. Una ajena responde 404 (no se revela que existe);
// "ver todas las tiendas" amplía la lectura, nunca la escritura.
export const loadGuideForCaller = async (
  id: number,
  user: IToken,
  mode: "read" | "write",
  transaction?: Transaction
): Promise<DispatchGuideModel> => {
  const guide = await DataBase.instance.dispatch_guide.findByPk(id, {
    transaction,
    lock: transaction && mode === "write" ? transaction.LOCK.UPDATE : undefined,
  });
  if (!guide) throw new AppError(404, "La guía no existe");
  if (!canReadGuide(user, guide)) throw new AppError(404, "La guía no existe");
  if (mode === "write" && isOutOfWriteScope(guide, resolveWriteScope(user))) throw new AppError(404, "La guía no existe");
  return guide;
};

export const assertDraft = (guide: DispatchGuideModel): void => {
  if (guide.status === "draft") return;
  throw new AppError(409, "La guía ya no es un borrador", undefined, "GUIDE_NOT_DRAFT");
};

const numberOrNull = (value: string | number | null): number | null => (value === null ? null : Number(value));

// Resumen para la tabla: nombres de tienda y "tiene PDF" en dos consultas
// para toda la página (sin N+1 y sin traer el contenido del archivo).
export const toGuideSummaryDtos = async (guides: DispatchGuideModel[], transaction?: Transaction): Promise<GuideSummaryDto[]> => {
  if (guides.length === 0) return [];
  const storeIds = [...new Set(guides.map((guide) => guide.business_unit_id).filter((id): id is number => id !== null))];
  const stores = storeIds.length
    ? await DataBase.instance.business_unit.findAll({ where: { id: { [Op.in]: storeIds } }, attributes: ["id", "business_code"], transaction })
    : [];
  // La tienda se identifica por su código (business_unit no tiene columna name).
  const storeNames = new Map(stores.map((store) => [Number(store.id), store.business_code]));
  const pdfs = await DataBase.instance.dispatch_guide_file.findAll({
    where: { guide_id: { [Op.in]: guides.map((guide) => guide.id) }, kind: "pdf" },
    attributes: ["guide_id"],
    transaction,
  });
  const withPdf = new Set(pdfs.map((file) => Number(file.guide_id)));

  return guides.map((guide) => ({
    id: Number(guide.id),
    company_id: Number(guide.company_id),
    business_unit_id: numberOrNull(guide.business_unit_id),
    business_unit_name: guide.business_unit_id === null ? null : storeNames.get(Number(guide.business_unit_id)) ?? null,
    emission_mode: guide.emission_mode,
    series: guide.series,
    number: numberOrNull(guide.number),
    number_text: guideNumberText(guide),
    status: guide.status,
    issue_date: guide.issue_date,
    transfer_start_date: guide.transfer_start_date,
    reason_code: guide.reason_code,
    reason_label: GUIDE_REASONS[guide.reason_code] ?? guide.reason_code,
    recipient_name: guide.recipient_name,
    recipient_doc_number: guide.recipient_doc_number,
    destination_address: guide.destination_address,
    quotation_id: numberOrNull(guide.quotation_id),
    stock_document_id: numberOrNull(guide.stock_document_id),
    has_pdf: withPdf.has(Number(guide.id)),
    createdAt: utcToBusinessParts(guide.created_at),
  }));
};

const warehouseName = async (id: number | null, transaction?: Transaction): Promise<string | null> => {
  if (id === null) return null;
  const warehouse = await DataBase.instance.warehouse.findByPk(id, { attributes: ["name"], transaction });
  return warehouse?.name ?? null;
};

// Detalle completo de una guía (una por vez: las consultas extra son por guía,
// no por fila de una lista).
export const toGuideDto = async (guide: DispatchGuideModel, transaction?: Transaction): Promise<GuideDto> => {
  const [summary] = await toGuideSummaryDtos([guide], transaction);
  const guideId = Number(guide.id);
  const [lines, transports, related, pdf, exitDocument, sourceDocument, originName, destinationName] = await Promise.all([
    DataBase.instance.dispatch_guide_line.findAll({ where: { guide_id: guideId }, order: [["line_no", "asc"]], transaction }),
    DataBase.instance.dispatch_guide_transport.findAll({ where: { guide_id: guideId }, order: [["id", "asc"]], transaction }),
    DataBase.instance.dispatch_guide_related_document.findAll({ where: { guide_id: guideId }, order: [["id", "asc"]], transaction }),
    DataBase.instance.dispatch_guide_file.findOne({
      where: { guide_id: guideId, kind: "pdf" },
      attributes: ["file_name", "size_bytes", "updated_at", "created_at"],
      transaction,
    }),
    DataBase.instance.stock_document.findOne({
      where: { dispatch_guide_id: guideId, reversal_of_id: null },
      order: [["id", "desc"]],
      transaction,
    }),
    guide.stock_document_id === null ? Promise.resolve(null) : DataBase.instance.stock_document.findByPk(guide.stock_document_id, { transaction }),
    warehouseName(numberOrNull(guide.origin_warehouse_id), transaction),
    warehouseName(numberOrNull(guide.destination_warehouse_id), transaction),
  ]);

  return {
    ...(summary as GuideSummaryDto),
    reason_note: guide.reason_note,
    transport_mode: guide.transport_mode,
    light_vehicle: Boolean(guide.light_vehicle),
    gross_weight_kg: guide.gross_weight_kg === null ? null : Number(guide.gross_weight_kg),
    packages: guide.packages,
    origin_warehouse_id: numberOrNull(guide.origin_warehouse_id),
    origin_warehouse_name: originName,
    origin_address: guide.origin_address,
    origin_ubigeo: guide.origin_ubigeo,
    origin_establishment_code: guide.origin_establishment_code,
    destination_warehouse_id: numberOrNull(guide.destination_warehouse_id),
    destination_warehouse_name: destinationName,
    destination_ubigeo: guide.destination_ubigeo,
    destination_establishment_code: guide.destination_establishment_code,
    client_id: numberOrNull(guide.client_id),
    recipient_doc_type: guide.recipient_doc_type,
    carrier_supplier_id: numberOrNull(guide.carrier_supplier_id),
    carrier_ruc: guide.carrier_ruc,
    carrier_name: guide.carrier_name,
    carrier_mtc_registration: guide.carrier_mtc_registration,
    stock_document_number: sourceDocument ? documentNumberText(sourceDocument) : null,
    exit_document: exitDocument
      ? { id: Number(exitDocument.id), number_text: documentNumberText(exitDocument), status: exitDocument.status }
      : null,
    notes: guide.notes,
    lines: lines.map((line) => ({
      id: Number(line.id),
      line_no: line.line_no,
      product_id: numberOrNull(line.product_id),
      quotation_item_id: numberOrNull(line.quotation_item_id),
      product_code: line.product_code,
      description: line.description,
      color: line.color,
      quantity: Number(line.quantity),
      unit_code: line.unit_code,
    })),
    vehicles: transports
      .filter((transport) => transport.kind === "vehicle")
      .map((transport) => ({ vehicle_id: numberOrNull(transport.vehicle_id), plate: transport.plate, is_main: Boolean(transport.is_main) })),
    drivers: transports
      .filter((transport) => transport.kind === "driver")
      .map((transport) => ({
        driver_id: numberOrNull(transport.driver_id),
        doc_type: transport.driver_doc_type,
        doc_number: transport.driver_doc_number,
        first_names: transport.driver_first_names,
        last_names: transport.driver_last_names,
        license_number: transport.license_number,
        is_main: Boolean(transport.is_main),
      })),
    related_documents: related.map((document) => ({
      doc_type: document.doc_type,
      doc_type_label: RELATED_DOC_TYPES[document.doc_type] ?? document.doc_type,
      series_number: document.series_number,
      issuer_ruc: document.issuer_ruc,
    })),
    pdf: pdf ? { file_name: pdf.file_name, size_bytes: pdf.size_bytes, uploadedAt: utcToBusinessParts(pdf.updated_at ?? pdf.created_at) } : null,
    registeredAt: guide.registered_at ? utcToBusinessParts(guide.registered_at) : null,
    voidedAt: guide.voided_at ? utcToBusinessParts(guide.voided_at) : null,
    void_reason: guide.void_reason,
  };
};

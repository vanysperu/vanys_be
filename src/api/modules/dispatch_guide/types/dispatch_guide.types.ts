import type { EmissionMode, GuideStatus, TransportMode } from "../model/dispatch_guide.models";

type DateParts = { date: string; time: string };

// Motivos de traslado (catálogo 20 de SUNAT) que ofrece el sistema (plan §9.2).
export const GUIDE_REASONS: Record<string, string> = {
  "01": "Venta",
  "02": "Compra",
  "03": "Venta con entrega a terceros",
  "04": "Traslado entre establecimientos de la misma empresa",
  "05": "Consignación",
  "06": "Devolución",
  "07": "Recojo de bienes transformados",
  "13": "Otros",
  "14": "Venta sujeta a confirmación",
  "17": "Traslado de bienes para transformación",
};
export const GUIDE_REASON_CODES = Object.keys(GUIDE_REASONS);

// Motivos de venta: una guía de estos motivos, desde una cotización, descuenta
// el stock si la tienda eligió "al emitir la guía" (D4).
export const SALE_REASON_CODES = ["01", "03", "14"];

// Catálogo 06 de SUNAT (tipo de documento de identidad) que usa la guía.
export const IDENTITY_DOC_TYPES: Record<string, string> = { "1": "DNI", "4": "Carné de extranjería", "6": "RUC", "7": "Pasaporte", "0": "Otro" };

// Catálogo 61 de SUNAT (documentos relacionados) más comunes.
export const RELATED_DOC_TYPES: Record<string, string> = {
  "01": "Factura",
  "03": "Boleta de venta",
  "09": "Guía de remisión remitente",
  "31": "Guía de remisión transportista",
  "49": "Constancia de depósito - IVAP",
  "50": "Declaración aduanera de mercancías",
  "52": "Declaración simplificada (DS)",
  "80": "Constancia de depósito - detracción",
};

// ------------------------------------------------------------- catálogos
export interface VehicleDto {
  id: number;
  company_id: number;
  plate: string;
  description: string | null;
  authorization_number: string | null;
  active: boolean;
  createdAt: DateParts;
}

export interface VehicleInput {
  plate: string;
  description?: string | null;
  authorization_number?: string | null;
}

export interface DriverDto {
  id: number;
  company_id: number;
  doc_type: string;
  doc_number: string;
  first_names: string;
  last_names: string;
  license_number: string;
  active: boolean;
  createdAt: DateParts;
}

export interface DriverInput {
  doc_type: string;
  doc_number: string;
  first_names: string;
  last_names: string;
  license_number: string;
}

export interface CatalogListParams {
  // null = todas las empresas (Super Administrador sin empresa elegida).
  companyId: number | null;
  page: number;
  limit: number;
  orderBy: string;
  orderDir: "asc" | "desc";
  searchTerm?: string;
  // "active" | "inactive"; sin valor = todos.
  status?: string;
}

export interface CarrierDto {
  id: number;
  name: string;
  document_number: string | null;
  mtc_registration: string | null;
}

// ---------------------------------------------------------------- guías
export interface GuideLineInput {
  product_id?: number | null;
  quotation_item_id?: number | null;
  product_code?: string | null;
  description: string;
  color?: string | null;
  quantity: number;
  unit_code?: string | null;
}

export interface GuideRelatedDocumentInput {
  doc_type: string;
  series_number: string;
  issuer_ruc?: string | null;
}

// Lo que manda el formulario al crear o editar un borrador. Todo es opcional
// salvo el motivo y las líneas: un borrador puede quedar incompleto; lo
// obligatorio para SUNAT se exige al registrar la guía emitida.
export interface GuideInput {
  company_id?: number | null;
  business_unit_id?: number | null;
  quotation_id?: number | null;
  stock_document_id?: number | null;
  reason_code: string;
  reason_note?: string | null;
  transfer_start_date?: string | null;
  transport_mode: TransportMode;
  light_vehicle?: boolean;
  gross_weight_kg?: number | null;
  packages?: number | null;
  origin_warehouse_id?: number | null;
  origin_address?: string | null;
  origin_ubigeo?: string | null;
  origin_establishment_code?: string | null;
  destination_warehouse_id?: number | null;
  destination_address?: string | null;
  destination_ubigeo?: string | null;
  destination_establishment_code?: string | null;
  client_id?: number | null;
  recipient_doc_type?: string | null;
  recipient_doc_number?: string | null;
  recipient_name?: string | null;
  carrier_supplier_id?: number | null;
  // Del catálogo; el primero es el principal.
  vehicle_ids?: number[];
  driver_ids?: number[];
  notes?: string | null;
  lines: GuideLineInput[];
  related_documents?: GuideRelatedDocumentInput[];
}

// Registrar la guía ya emitida en SUNAT (modo manual).
export interface RegisterGuideInput {
  series: string;
  number: number;
  issue_date?: string | null;
}

export interface GuideFileInput {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

export interface GuideLineDto {
  id: number;
  line_no: number;
  product_id: number | null;
  quotation_item_id: number | null;
  product_code: string | null;
  description: string;
  color: string;
  quantity: number;
  unit_code: string;
}

export interface GuideVehicleDto {
  vehicle_id: number | null;
  plate: string | null;
  is_main: boolean;
}

export interface GuideDriverDto {
  driver_id: number | null;
  doc_type: string | null;
  doc_number: string | null;
  first_names: string | null;
  last_names: string | null;
  license_number: string | null;
  is_main: boolean;
}

export interface GuideRelatedDocumentDto {
  doc_type: string;
  doc_type_label: string;
  series_number: string;
  issuer_ruc: string | null;
}

export interface GuideSummaryDto {
  id: number;
  company_id: number;
  business_unit_id: number | null;
  business_unit_name: string | null;
  emission_mode: EmissionMode;
  series: string | null;
  number: number | null;
  // "T001-123" o null si es borrador.
  number_text: string | null;
  status: GuideStatus;
  issue_date: string | null;
  transfer_start_date: string | null;
  reason_code: string;
  reason_label: string;
  recipient_name: string | null;
  recipient_doc_number: string | null;
  destination_address: string | null;
  quotation_id: number | null;
  stock_document_id: number | null;
  has_pdf: boolean;
  createdAt: DateParts;
}

export interface GuideDto extends GuideSummaryDto {
  reason_note: string | null;
  transport_mode: TransportMode;
  light_vehicle: boolean;
  gross_weight_kg: number | null;
  packages: number | null;
  origin_warehouse_id: number | null;
  origin_warehouse_name: string | null;
  origin_address: string | null;
  origin_ubigeo: string | null;
  origin_establishment_code: string | null;
  destination_warehouse_id: number | null;
  destination_warehouse_name: string | null;
  destination_ubigeo: string | null;
  destination_establishment_code: string | null;
  client_id: number | null;
  recipient_doc_type: string | null;
  carrier_supplier_id: number | null;
  carrier_ruc: string | null;
  carrier_name: string | null;
  carrier_mtc_registration: string | null;
  stock_document_number: string | null;
  // Salida de almacén que generó la guía (D4), si hubo.
  exit_document: { id: number; number_text: string; status: string } | null;
  notes: string | null;
  lines: GuideLineDto[];
  vehicles: GuideVehicleDto[];
  drivers: GuideDriverDto[];
  related_documents: GuideRelatedDocumentDto[];
  pdf: { file_name: string; size_bytes: number; uploadedAt: DateParts } | null;
  registeredAt: DateParts | null;
  voidedAt: DateParts | null;
  void_reason: string | null;
}

export interface ListGuidesParams {
  // null = todas las empresas (Super Administrador sin empresa elegida).
  companyId: number | null;
  // Tienda a la que se limita la lectura (§11.1); undefined = todas.
  businessUnitId: number | undefined;
  page: number;
  limit: number;
  orderBy: string;
  orderDir: "asc" | "desc";
  searchTerm?: string;
  statuses?: GuideStatus[];
  quotationId?: number;
  dateFrom?: string;
  dateTo?: string;
}

// Línea precargada desde una cotización: lo pedido, lo ya despachado en guías
// registradas o en borrador, y lo que falta.
export interface PrefillLineDto extends GuideLineInput {
  ordered: number | null;
  dispatched: number | null;
  pending: number | null;
}

export interface GuidePrefillDto extends Omit<GuideInput, "lines"> {
  company_id: number;
  business_unit_id: number | null;
  business_unit_name: string | null;
  source: { kind: "quotation" | "transfer"; id: number; label: string };
  lines: PrefillLineDto[];
  // Cosas que el usuario debe revisar (ej. "la tienda no tiene almacén").
  warnings: string[];
}

export interface FileDownload {
  fileName: string;
  mimeType: string;
  data: Buffer;
}

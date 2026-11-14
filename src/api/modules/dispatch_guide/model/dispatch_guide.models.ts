import { BuildOptions, DataTypes, Model, ModelAttributes, Sequelize } from "sequelize";

// Tablas de la guía de remisión remitente (Sprint 2, ítem 1; migración
// 20261116100000-create-dispatch-guide.js). Un solo archivo porque son un
// agregado: la guía con sus líneas, transporte, documentos y archivos, más los
// catálogos de vehículos y conductores y el modo de emisión de la empresa.

interface AuditAttributes {
  created_by: number | null;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

const AUDIT_COLUMNS = {
  created_by: { type: DataTypes.BIGINT, allowNull: true },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updated_by: { type: DataTypes.BIGINT, allowNull: true },
  updated_at: { type: DataTypes.DATE, allowNull: true },
};

const ID = { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true };

type StaticOf<M> = typeof Model & { new (values?: object, options?: BuildOptions): M };

const define = <M>(sequelize: Sequelize, name: string, attributes: ModelAttributes) =>
  <StaticOf<M>>sequelize.define(name, { ...attributes, ...AUDIT_COLUMNS }, { tableName: name, timestamps: false });

export const EMISSION_MODES = ["manual", "sunat_direct", "pse"] as const;
export type EmissionMode = (typeof EMISSION_MODES)[number];

// sending/accepted/rejected/error son de la emisión directa (todavía no
// existe). En modo manual: draft → manual (registrada) → voided.
export const GUIDE_STATUSES = ["draft", "sending", "accepted", "rejected", "error", "manual", "voided"] as const;
export type GuideStatus = (typeof GUIDE_STATUSES)[number];

export const TRANSPORT_MODES = ["public", "private"] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

// ------------------------------------------------------ company_sunat_settings
export interface CompanySunatSettingsAttributes extends AuditAttributes {
  id: number;
  company_id: number;
  emission_mode: EmissionMode;
}
export interface CompanySunatSettingsModel extends Model<CompanySunatSettingsAttributes>, CompanySunatSettingsAttributes {}
export type CompanySunatSettingsStatic = StaticOf<CompanySunatSettingsModel>;
export const CompanySunatSettingsFactory = (sequelize: Sequelize): CompanySunatSettingsStatic =>
  define<CompanySunatSettingsModel>(sequelize, "company_sunat_settings", {
    id: ID,
    company_id: { type: DataTypes.BIGINT, allowNull: false },
    emission_mode: { type: DataTypes.ENUM(...EMISSION_MODES), allowNull: false, defaultValue: "manual" },
  });

// ----------------------------------------------------------- transport_vehicle
export interface TransportVehicleAttributes extends AuditAttributes {
  id: number;
  company_id: number;
  plate: string;
  description: string | null;
  // Certificado de habilitación vehicular / TUC (opcional).
  authorization_number: string | null;
  active: boolean;
}
export interface TransportVehicleModel extends Model<TransportVehicleAttributes>, TransportVehicleAttributes {}
export type TransportVehicleStatic = StaticOf<TransportVehicleModel>;
export const TransportVehicleFactory = (sequelize: Sequelize): TransportVehicleStatic =>
  define<TransportVehicleModel>(sequelize, "transport_vehicle", {
    id: ID,
    company_id: { type: DataTypes.BIGINT, allowNull: false },
    plate: { type: DataTypes.STRING(10), allowNull: false },
    description: { type: DataTypes.STRING(120), allowNull: true },
    authorization_number: { type: DataTypes.STRING(30), allowNull: true },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  });

// ------------------------------------------------------------ transport_driver
export interface TransportDriverAttributes extends AuditAttributes {
  id: number;
  company_id: number;
  // Catálogo 06 de SUNAT: 1 = DNI, 4 = carné de extranjería, 7 = pasaporte.
  doc_type: string;
  doc_number: string;
  first_names: string;
  last_names: string;
  license_number: string;
  active: boolean;
}
export interface TransportDriverModel extends Model<TransportDriverAttributes>, TransportDriverAttributes {}
export type TransportDriverStatic = StaticOf<TransportDriverModel>;
export const TransportDriverFactory = (sequelize: Sequelize): TransportDriverStatic =>
  define<TransportDriverModel>(sequelize, "transport_driver", {
    id: ID,
    company_id: { type: DataTypes.BIGINT, allowNull: false },
    doc_type: { type: DataTypes.STRING(2), allowNull: false, defaultValue: "1" },
    doc_number: { type: DataTypes.STRING(15), allowNull: false },
    first_names: { type: DataTypes.STRING(100), allowNull: false },
    last_names: { type: DataTypes.STRING(100), allowNull: false },
    license_number: { type: DataTypes.STRING(20), allowNull: false },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  });

// -------------------------------------------------------------- dispatch_guide
export interface DispatchGuideAttributes extends AuditAttributes {
  id: number;
  company_id: number;
  business_unit_id: number | null;
  emission_mode: EmissionMode;
  // null mientras es borrador: el número lo da SUNAT.
  series: string | null;
  number: number | null;
  status: GuideStatus;
  issue_date: string | null;
  transfer_start_date: string | null;
  // Catálogo 20 de SUNAT (motivo de traslado).
  reason_code: string;
  reason_note: string | null;
  transport_mode: TransportMode;
  // Vehículo M1 o L (auto, moto): no se declaran placa ni conductor.
  light_vehicle: boolean;
  gross_weight_kg: string | null;
  packages: number | null;
  origin_warehouse_id: number | null;
  origin_address: string | null;
  origin_ubigeo: string | null;
  origin_establishment_code: string | null;
  destination_warehouse_id: number | null;
  destination_address: string | null;
  destination_ubigeo: string | null;
  destination_establishment_code: string | null;
  client_id: number | null;
  recipient_doc_type: string | null;
  recipient_doc_number: string | null;
  recipient_name: string | null;
  carrier_supplier_id: number | null;
  carrier_ruc: string | null;
  carrier_name: string | null;
  carrier_mtc_registration: string | null;
  quotation_id: number | null;
  // Transferencia de almacén (motivo 04) de la que nace la guía.
  stock_document_id: number | null;
  notes: string | null;
  registered_at: Date | null;
  registered_by: number | null;
  voided_at: Date | null;
  voided_by: number | null;
  void_reason: string | null;
}
export interface DispatchGuideModel extends Model<DispatchGuideAttributes>, DispatchGuideAttributes {}
export type DispatchGuideStatic = StaticOf<DispatchGuideModel>;
export const DispatchGuideFactory = (sequelize: Sequelize): DispatchGuideStatic =>
  define<DispatchGuideModel>(sequelize, "dispatch_guide", {
    id: ID,
    company_id: { type: DataTypes.BIGINT, allowNull: false },
    business_unit_id: { type: DataTypes.BIGINT, allowNull: true },
    emission_mode: { type: DataTypes.ENUM(...EMISSION_MODES), allowNull: false, defaultValue: "manual" },
    series: { type: DataTypes.STRING(4), allowNull: true },
    number: { type: DataTypes.INTEGER, allowNull: true },
    status: { type: DataTypes.ENUM(...GUIDE_STATUSES), allowNull: false, defaultValue: "draft" },
    issue_date: { type: DataTypes.DATEONLY, allowNull: true },
    transfer_start_date: { type: DataTypes.DATEONLY, allowNull: true },
    reason_code: { type: DataTypes.CHAR(2), allowNull: false },
    reason_note: { type: DataTypes.STRING(255), allowNull: true },
    transport_mode: { type: DataTypes.ENUM(...TRANSPORT_MODES), allowNull: false, defaultValue: "private" },
    light_vehicle: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    gross_weight_kg: { type: DataTypes.DECIMAL(12, 3), allowNull: true },
    packages: { type: DataTypes.INTEGER, allowNull: true },
    origin_warehouse_id: { type: DataTypes.BIGINT, allowNull: true },
    origin_address: { type: DataTypes.STRING(255), allowNull: true },
    origin_ubigeo: { type: DataTypes.CHAR(6), allowNull: true },
    origin_establishment_code: { type: DataTypes.CHAR(4), allowNull: true },
    destination_warehouse_id: { type: DataTypes.BIGINT, allowNull: true },
    destination_address: { type: DataTypes.STRING(255), allowNull: true },
    destination_ubigeo: { type: DataTypes.CHAR(6), allowNull: true },
    destination_establishment_code: { type: DataTypes.CHAR(4), allowNull: true },
    client_id: { type: DataTypes.BIGINT, allowNull: true },
    recipient_doc_type: { type: DataTypes.STRING(2), allowNull: true },
    recipient_doc_number: { type: DataTypes.STRING(15), allowNull: true },
    recipient_name: { type: DataTypes.STRING(200), allowNull: true },
    carrier_supplier_id: { type: DataTypes.BIGINT, allowNull: true },
    carrier_ruc: { type: DataTypes.STRING(11), allowNull: true },
    carrier_name: { type: DataTypes.STRING(200), allowNull: true },
    carrier_mtc_registration: { type: DataTypes.STRING(30), allowNull: true },
    quotation_id: { type: DataTypes.BIGINT, allowNull: true },
    stock_document_id: { type: DataTypes.BIGINT, allowNull: true },
    notes: { type: DataTypes.STRING(500), allowNull: true },
    registered_at: { type: DataTypes.DATE, allowNull: true },
    registered_by: { type: DataTypes.BIGINT, allowNull: true },
    voided_at: { type: DataTypes.DATE, allowNull: true },
    voided_by: { type: DataTypes.BIGINT, allowNull: true },
    void_reason: { type: DataTypes.STRING(255), allowNull: true },
  });

// --------------------------------------------------------- dispatch_guide_line
export interface DispatchGuideLineAttributes extends AuditAttributes {
  id: number;
  company_id: number;
  guide_id: number;
  line_no: number;
  product_id: number | null;
  // Ítem de la cotización que despacha (control de entregas parciales).
  quotation_item_id: number | null;
  product_code: string | null;
  description: string;
  // Nombre del color ('' = sin color), igual que en el inventario.
  color: string;
  quantity: string;
  // Catálogo 03 de SUNAT (unidad de medida), por defecto NIU (unidad).
  unit_code: string;
}
export interface DispatchGuideLineModel extends Model<DispatchGuideLineAttributes>, DispatchGuideLineAttributes {}
export type DispatchGuideLineStatic = StaticOf<DispatchGuideLineModel>;
export const DispatchGuideLineFactory = (sequelize: Sequelize): DispatchGuideLineStatic =>
  define<DispatchGuideLineModel>(sequelize, "dispatch_guide_line", {
    id: ID,
    company_id: { type: DataTypes.BIGINT, allowNull: false },
    guide_id: { type: DataTypes.BIGINT, allowNull: false },
    line_no: { type: DataTypes.INTEGER, allowNull: false },
    product_id: { type: DataTypes.BIGINT, allowNull: true },
    quotation_item_id: { type: DataTypes.BIGINT, allowNull: true },
    product_code: { type: DataTypes.STRING(60), allowNull: true },
    description: { type: DataTypes.STRING(500), allowNull: false },
    color: { type: DataTypes.STRING(60), allowNull: false, defaultValue: "" },
    quantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
    unit_code: { type: DataTypes.STRING(5), allowNull: false, defaultValue: "NIU" },
  });

// ---------------------------------------------------- dispatch_guide_transport
export interface DispatchGuideTransportAttributes extends AuditAttributes {
  id: number;
  company_id: number;
  guide_id: number;
  kind: "vehicle" | "driver";
  vehicle_id: number | null;
  driver_id: number | null;
  plate: string | null;
  driver_doc_type: string | null;
  driver_doc_number: string | null;
  driver_first_names: string | null;
  driver_last_names: string | null;
  license_number: string | null;
  // Principal o secundario (SUNAT admite varios vehículos y conductores).
  is_main: boolean;
}
export interface DispatchGuideTransportModel extends Model<DispatchGuideTransportAttributes>, DispatchGuideTransportAttributes {}
export type DispatchGuideTransportStatic = StaticOf<DispatchGuideTransportModel>;
export const DispatchGuideTransportFactory = (sequelize: Sequelize): DispatchGuideTransportStatic =>
  define<DispatchGuideTransportModel>(sequelize, "dispatch_guide_transport", {
    id: ID,
    company_id: { type: DataTypes.BIGINT, allowNull: false },
    guide_id: { type: DataTypes.BIGINT, allowNull: false },
    kind: { type: DataTypes.ENUM("vehicle", "driver"), allowNull: false },
    vehicle_id: { type: DataTypes.BIGINT, allowNull: true },
    driver_id: { type: DataTypes.BIGINT, allowNull: true },
    plate: { type: DataTypes.STRING(10), allowNull: true },
    driver_doc_type: { type: DataTypes.STRING(2), allowNull: true },
    driver_doc_number: { type: DataTypes.STRING(15), allowNull: true },
    driver_first_names: { type: DataTypes.STRING(100), allowNull: true },
    driver_last_names: { type: DataTypes.STRING(100), allowNull: true },
    license_number: { type: DataTypes.STRING(20), allowNull: true },
    is_main: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  });

// --------------------------------------------- dispatch_guide_related_document
export interface DispatchGuideRelatedDocumentAttributes extends AuditAttributes {
  id: number;
  company_id: number;
  guide_id: number;
  // Catálogo 61 de SUNAT (01 factura, 03 boleta, 09 guía remitente...).
  doc_type: string;
  series_number: string;
  issuer_ruc: string | null;
}
export interface DispatchGuideRelatedDocumentModel
  extends Model<DispatchGuideRelatedDocumentAttributes>,
    DispatchGuideRelatedDocumentAttributes {}
export type DispatchGuideRelatedDocumentStatic = StaticOf<DispatchGuideRelatedDocumentModel>;
export const DispatchGuideRelatedDocumentFactory = (sequelize: Sequelize): DispatchGuideRelatedDocumentStatic =>
  define<DispatchGuideRelatedDocumentModel>(sequelize, "dispatch_guide_related_document", {
    id: ID,
    company_id: { type: DataTypes.BIGINT, allowNull: false },
    guide_id: { type: DataTypes.BIGINT, allowNull: false },
    doc_type: { type: DataTypes.STRING(2), allowNull: false },
    series_number: { type: DataTypes.STRING(30), allowNull: false },
    issuer_ruc: { type: DataTypes.STRING(11), allowNull: true },
  });

// --------------------------------------------------------- dispatch_guide_file
export type GuideFileKind = "xml" | "cdr" | "pdf";
export interface DispatchGuideFileAttributes extends AuditAttributes {
  id: number;
  company_id: number;
  guide_id: number;
  kind: GuideFileKind;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  content: Buffer;
}
export interface DispatchGuideFileModel extends Model<DispatchGuideFileAttributes>, DispatchGuideFileAttributes {}
export type DispatchGuideFileStatic = StaticOf<DispatchGuideFileModel>;
export const DispatchGuideFileFactory = (sequelize: Sequelize): DispatchGuideFileStatic =>
  define<DispatchGuideFileModel>(sequelize, "dispatch_guide_file", {
    id: ID,
    company_id: { type: DataTypes.BIGINT, allowNull: false },
    guide_id: { type: DataTypes.BIGINT, allowNull: false },
    kind: { type: DataTypes.ENUM("xml", "cdr", "pdf"), allowNull: false },
    file_name: { type: DataTypes.STRING(200), allowNull: false },
    mime_type: { type: DataTypes.STRING(60), allowNull: false },
    size_bytes: { type: DataTypes.INTEGER, allowNull: false },
    sha256: { type: DataTypes.CHAR(64), allowNull: false },
    content: { type: DataTypes.BLOB("long"), allowNull: false },
  });

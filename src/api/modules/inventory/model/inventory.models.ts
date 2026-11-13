import { BuildOptions, DataTypes, Model, ModelAttributes, Sequelize } from "sequelize";

// Tablas del inventario (Sprint 2, ítem 2; migración 20261114120000-create-inventory.js).
// Un solo archivo porque son un agregado: almacenes, documentos, libro de
// movimientos, saldos, lotes, costo promedio y numeración.

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

// ---------------------------------------------------------------- warehouse
export interface WarehouseAttributes extends AuditAttributes {
  id: number;
  company_id: number;
  // null solo en el almacén virtual "En tránsito" de la empresa.
  business_unit_id: number | null;
  code: string;
  name: string;
  address: string | null;
  ubigeo: string | null;
  sunat_establishment_code: string | null;
  allow_negative_stock: boolean;
  track_lots: boolean;
  track_expiry: boolean;
  expiry_alert_days: number;
  block_expired: boolean;
  is_default: boolean;
  is_transit: boolean;
  active: boolean;
}
export interface WarehouseModel extends Model<WarehouseAttributes>, WarehouseAttributes {}
export type WarehouseStatic = StaticOf<WarehouseModel>;
export const WarehouseFactory = (sequelize: Sequelize): WarehouseStatic =>
  define<WarehouseModel>(sequelize, "warehouse", {
    id: ID,
    company_id: { type: DataTypes.BIGINT, allowNull: false },
    business_unit_id: { type: DataTypes.BIGINT, allowNull: true },
    code: { type: DataTypes.STRING(20), allowNull: false },
    name: { type: DataTypes.STRING(120), allowNull: false },
    address: { type: DataTypes.STRING(255), allowNull: true },
    ubigeo: { type: DataTypes.CHAR(6), allowNull: true },
    sunat_establishment_code: { type: DataTypes.CHAR(4), allowNull: true },
    allow_negative_stock: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    track_lots: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    track_expiry: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    expiry_alert_days: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 },
    block_expired: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    is_default: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    is_transit: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  });

// ---------------------------------------------------------- document_series
export interface DocumentSeriesAttributes extends AuditAttributes {
  id: number;
  company_id: number;
  document_type: string;
  series: string;
  next_number: number;
}
export interface DocumentSeriesModel extends Model<DocumentSeriesAttributes>, DocumentSeriesAttributes {}
export type DocumentSeriesStatic = StaticOf<DocumentSeriesModel>;
export const DocumentSeriesFactory = (sequelize: Sequelize): DocumentSeriesStatic =>
  define<DocumentSeriesModel>(sequelize, "document_series", {
    id: ID,
    company_id: { type: DataTypes.BIGINT, allowNull: false },
    document_type: { type: DataTypes.STRING(20), allowNull: false },
    series: { type: DataTypes.STRING(10), allowNull: false },
    next_number: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  });

// ---------------------------------------------------------------- stock_lot
export interface StockLotAttributes extends AuditAttributes {
  id: number;
  company_id: number;
  product_id: number;
  color_key: string;
  lot_code: string;
  expiry_date: string | null;
  supplier_id: number | null;
}
export interface StockLotModel extends Model<StockLotAttributes>, StockLotAttributes {}
export type StockLotStatic = StaticOf<StockLotModel>;
export const StockLotFactory = (sequelize: Sequelize): StockLotStatic =>
  define<StockLotModel>(sequelize, "stock_lot", {
    id: ID,
    company_id: { type: DataTypes.BIGINT, allowNull: false },
    product_id: { type: DataTypes.BIGINT, allowNull: false },
    color_key: { type: DataTypes.STRING(60), allowNull: false, defaultValue: "" },
    lot_code: { type: DataTypes.STRING(40), allowNull: false },
    expiry_date: { type: DataTypes.DATEONLY, allowNull: true },
    supplier_id: { type: DataTypes.BIGINT, allowNull: true },
  });

// ----------------------------------------------------------- stock_document
export const DOC_TYPES = ["entry", "exit", "transfer", "adjustment"] as const;
export type DocType = (typeof DOC_TYPES)[number];
export const DOC_STATUSES = ["draft", "posted", "dispatched", "received", "partially_received", "cancelled"] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

export interface StockDocumentAttributes extends AuditAttributes {
  id: number;
  company_id: number;
  business_unit_id: number | null;
  warehouse_id: number;
  target_warehouse_id: number | null;
  doc_type: DocType;
  reason_code: string;
  series: string;
  number: number;
  status: DocStatus;
  document_date: string;
  supplier_id: number | null;
  client_id: number | null;
  quotation_id: number | null;
  // Anulación de un documento confirmado: el documento inverso apunta al original.
  reversal_of_id: number | null;
  notes: string | null;
  posted_at: Date | null;
  posted_by: number | null;
  received_at: Date | null;
  received_by: number | null;
  cancelled_at: Date | null;
  cancelled_by: number | null;
  cancel_reason: string | null;
}
export interface StockDocumentModel extends Model<StockDocumentAttributes>, StockDocumentAttributes {}
export type StockDocumentStatic = StaticOf<StockDocumentModel>;
export const StockDocumentFactory = (sequelize: Sequelize): StockDocumentStatic =>
  define<StockDocumentModel>(sequelize, "stock_document", {
    id: ID,
    company_id: { type: DataTypes.BIGINT, allowNull: false },
    business_unit_id: { type: DataTypes.BIGINT, allowNull: true },
    warehouse_id: { type: DataTypes.BIGINT, allowNull: false },
    target_warehouse_id: { type: DataTypes.BIGINT, allowNull: true },
    doc_type: { type: DataTypes.ENUM(...DOC_TYPES), allowNull: false },
    reason_code: { type: DataTypes.STRING(30), allowNull: false },
    series: { type: DataTypes.STRING(10), allowNull: false },
    number: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.ENUM(...DOC_STATUSES), allowNull: false, defaultValue: "draft" },
    document_date: { type: DataTypes.DATEONLY, allowNull: false },
    supplier_id: { type: DataTypes.BIGINT, allowNull: true },
    client_id: { type: DataTypes.BIGINT, allowNull: true },
    quotation_id: { type: DataTypes.BIGINT, allowNull: true },
    reversal_of_id: { type: DataTypes.BIGINT, allowNull: true },
    notes: { type: DataTypes.STRING(500), allowNull: true },
    posted_at: { type: DataTypes.DATE, allowNull: true },
    posted_by: { type: DataTypes.BIGINT, allowNull: true },
    received_at: { type: DataTypes.DATE, allowNull: true },
    received_by: { type: DataTypes.BIGINT, allowNull: true },
    cancelled_at: { type: DataTypes.DATE, allowNull: true },
    cancelled_by: { type: DataTypes.BIGINT, allowNull: true },
    cancel_reason: { type: DataTypes.STRING(255), allowNull: true },
  });

// ------------------------------------------------------ stock_document_line
export interface StockDocumentLineAttributes extends AuditAttributes {
  id: number;
  company_id: number;
  document_id: number;
  product_id: number;
  color_key: string;
  lot_id: number | null;
  // Ingreso a un almacén con lotes: código y vencimiento del lote nuevo.
  lot_code: string | null;
  expiry_date: string | null;
  // Ajuste: con signo (+ sobra, − falta). El resto: siempre positiva.
  quantity: string;
  received_quantity: string | null;
  unit_cost: string | null;
}
export interface StockDocumentLineModel extends Model<StockDocumentLineAttributes>, StockDocumentLineAttributes {}
export type StockDocumentLineStatic = StaticOf<StockDocumentLineModel>;
export const StockDocumentLineFactory = (sequelize: Sequelize): StockDocumentLineStatic =>
  define<StockDocumentLineModel>(sequelize, "stock_document_line", {
    id: ID,
    company_id: { type: DataTypes.BIGINT, allowNull: false },
    document_id: { type: DataTypes.BIGINT, allowNull: false },
    product_id: { type: DataTypes.BIGINT, allowNull: false },
    color_key: { type: DataTypes.STRING(60), allowNull: false, defaultValue: "" },
    lot_id: { type: DataTypes.BIGINT, allowNull: true },
    lot_code: { type: DataTypes.STRING(40), allowNull: true },
    expiry_date: { type: DataTypes.DATEONLY, allowNull: true },
    quantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
    received_quantity: { type: DataTypes.DECIMAL(14, 3), allowNull: true },
    unit_cost: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
  });

// ----------------------------------------------------------- stock_movement
// Libro inmutable: nunca se edita ni se borra (una anulación es otro movimiento).
export interface StockMovementAttributes extends AuditAttributes {
  id: number;
  company_id: number;
  warehouse_id: number;
  product_id: number;
  color_key: string;
  lot_key: number;
  quantity: string;
  balance_after: string;
  unit_cost: string | null;
  document_id: number;
  document_line_id: number | null;
  movement_at: Date;
}
export interface StockMovementModel extends Model<StockMovementAttributes>, StockMovementAttributes {}
export type StockMovementStatic = StaticOf<StockMovementModel>;
export const StockMovementFactory = (sequelize: Sequelize): StockMovementStatic =>
  define<StockMovementModel>(sequelize, "stock_movement", {
    id: ID,
    company_id: { type: DataTypes.BIGINT, allowNull: false },
    warehouse_id: { type: DataTypes.BIGINT, allowNull: false },
    product_id: { type: DataTypes.BIGINT, allowNull: false },
    color_key: { type: DataTypes.STRING(60), allowNull: false, defaultValue: "" },
    lot_key: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    quantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
    balance_after: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
    unit_cost: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    document_id: { type: DataTypes.BIGINT, allowNull: false },
    document_line_id: { type: DataTypes.BIGINT, allowNull: true },
    movement_at: { type: DataTypes.DATE, allowNull: false },
  });

// ------------------------------------------------------------ stock_balance
export interface StockBalanceAttributes extends AuditAttributes {
  id: number;
  company_id: number;
  warehouse_id: number;
  product_id: number;
  color_key: string;
  lot_key: number;
  on_hand: string;
  reserved: string;
}
export interface StockBalanceModel extends Model<StockBalanceAttributes>, StockBalanceAttributes {}
export type StockBalanceStatic = StaticOf<StockBalanceModel>;
export const StockBalanceFactory = (sequelize: Sequelize): StockBalanceStatic =>
  define<StockBalanceModel>(sequelize, "stock_balance", {
    id: ID,
    company_id: { type: DataTypes.BIGINT, allowNull: false },
    warehouse_id: { type: DataTypes.BIGINT, allowNull: false },
    product_id: { type: DataTypes.BIGINT, allowNull: false },
    color_key: { type: DataTypes.STRING(60), allowNull: false, defaultValue: "" },
    lot_key: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    on_hand: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
    reserved: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  });

// --------------------------------------------------------------- stock_cost
export interface StockCostAttributes extends AuditAttributes {
  id: number;
  company_id: number;
  product_id: number;
  color_key: string;
  avg_cost: string;
}
export interface StockCostModel extends Model<StockCostAttributes>, StockCostAttributes {}
export type StockCostStatic = StaticOf<StockCostModel>;
export const StockCostFactory = (sequelize: Sequelize): StockCostStatic =>
  define<StockCostModel>(sequelize, "stock_cost", {
    id: ID,
    company_id: { type: DataTypes.BIGINT, allowNull: false },
    product_id: { type: DataTypes.BIGINT, allowNull: false },
    color_key: { type: DataTypes.STRING(60), allowNull: false, defaultValue: "" },
    avg_cost: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
  });

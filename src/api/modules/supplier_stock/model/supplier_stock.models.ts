import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

// Tablas del stock de proveedores (Sprint 2, ítem 6; migración
// 20261114110000-create-supplier-stock.js). Las tres viven juntas porque son
// un solo agregado: la fuente, el historial de lecturas y las filas leídas.

const AUDIT_COLUMNS = {
  created_by: { type: DataTypes.BIGINT, allowNull: true },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updated_by: { type: DataTypes.BIGINT, allowNull: true },
  updated_at: { type: DataTypes.DATE, allowNull: true },
};

interface AuditAttributes {
  created_by: number | null;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export const SOURCE_TYPES = ["url", "upload"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
export const SOURCE_STATUSES = ["never", "running", "ok", "error"] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

// Qué columna del Excel es cada dato: el texto del encabezado (sin importar
// mayúsculas ni tildes) o la letra de la columna ("A", "C"...).
export interface ColumnMap {
  code: string;
  quantity: string;
  color?: string | null;
  description?: string | null;
  price?: string | null;
}

export interface SupplierStockSourceAttributes extends AuditAttributes {
  id: number;
  company_id: number;
  supplier_id: number;
  name: string;
  source_type: SourceType;
  // Enlace cifrado (puede traer un token del proveedor): nunca sale en claro.
  url_encrypted: string | null;
  sheet_name: string | null;
  header_row: number;
  column_map: ColumnMap;
  refresh_minutes: number;
  last_import_id: number | null;
  last_success_at: Date | null;
  last_status: SourceStatus;
  last_error: string | null;
  active: boolean;
}

export interface SupplierStockSourceModel extends Model<SupplierStockSourceAttributes>, SupplierStockSourceAttributes {}
export type SupplierStockSourceStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): SupplierStockSourceModel;
};

export function SupplierStockSourceFactory(sequelize: Sequelize): SupplierStockSourceStatic {
  return <SupplierStockSourceStatic>sequelize.define(
    "supplier_stock_source",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      supplier_id: { type: DataTypes.BIGINT, allowNull: false },
      name: { type: DataTypes.STRING(120), allowNull: false },
      source_type: { type: DataTypes.ENUM(...SOURCE_TYPES), allowNull: false, defaultValue: "url" },
      url_encrypted: { type: DataTypes.TEXT, allowNull: true },
      sheet_name: { type: DataTypes.STRING(100), allowNull: true },
      header_row: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      column_map: { type: DataTypes.JSON, allowNull: false },
      refresh_minutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 360 },
      last_import_id: { type: DataTypes.BIGINT, allowNull: true },
      last_success_at: { type: DataTypes.DATE, allowNull: true },
      last_status: { type: DataTypes.ENUM(...SOURCE_STATUSES), allowNull: false, defaultValue: "never" },
      last_error: { type: DataTypes.STRING(500), allowNull: true },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      ...AUDIT_COLUMNS,
    },
    { tableName: "supplier_stock_source", timestamps: false }
  );
}

export const IMPORT_TRIGGERS = ["manual", "upload", "schedule"] as const;
export type ImportTrigger = (typeof IMPORT_TRIGGERS)[number];

export interface SupplierStockImportAttributes extends AuditAttributes {
  id: number;
  company_id: number;
  source_id: number;
  trigger_type: ImportTrigger;
  started_at: Date;
  finished_at: Date | null;
  status: "running" | "ok" | "error";
  rows_read: number;
  rows_valid: number;
  file_sha256: string | null;
  error: string | null;
}

export interface SupplierStockImportModel extends Model<SupplierStockImportAttributes>, SupplierStockImportAttributes {}
export type SupplierStockImportStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): SupplierStockImportModel;
};

export function SupplierStockImportFactory(sequelize: Sequelize): SupplierStockImportStatic {
  return <SupplierStockImportStatic>sequelize.define(
    "supplier_stock_import",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      source_id: { type: DataTypes.BIGINT, allowNull: false },
      trigger_type: { type: DataTypes.ENUM(...IMPORT_TRIGGERS), allowNull: false },
      started_at: { type: DataTypes.DATE, allowNull: false },
      finished_at: { type: DataTypes.DATE, allowNull: true },
      status: { type: DataTypes.ENUM("running", "ok", "error"), allowNull: false, defaultValue: "running" },
      rows_read: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      rows_valid: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      file_sha256: { type: DataTypes.CHAR(64), allowNull: true },
      error: { type: DataTypes.STRING(500), allowNull: true },
      ...AUDIT_COLUMNS,
    },
    { tableName: "supplier_stock_import", timestamps: false }
  );
}

export interface SupplierStockItemAttributes extends AuditAttributes {
  id: number;
  company_id: number;
  source_id: number;
  import_id: number;
  code_raw: string;
  // Código normalizado (mayúsculas, sin espacios, guiones ni puntos): con
  // esto se cruza contra los códigos de los productos.
  code_norm: string;
  color: string | null;
  description: string | null;
  // null = la cantidad no se pudo interpretar (queda el texto original).
  quantity: number | null;
  quantity_text: string | null;
  price: number | null;
}

export interface SupplierStockItemModel extends Model<SupplierStockItemAttributes>, SupplierStockItemAttributes {}
export type SupplierStockItemStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): SupplierStockItemModel;
};

export function SupplierStockItemFactory(sequelize: Sequelize): SupplierStockItemStatic {
  return <SupplierStockItemStatic>sequelize.define(
    "supplier_stock_item",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      source_id: { type: DataTypes.BIGINT, allowNull: false },
      import_id: { type: DataTypes.BIGINT, allowNull: false },
      code_raw: { type: DataTypes.STRING(100), allowNull: false },
      code_norm: { type: DataTypes.STRING(100), allowNull: false },
      color: { type: DataTypes.STRING(100), allowNull: true },
      description: { type: DataTypes.STRING(255), allowNull: true },
      quantity: { type: DataTypes.INTEGER, allowNull: true },
      quantity_text: { type: DataTypes.STRING(60), allowNull: true },
      price: { type: DataTypes.DECIMAL(12, 4), allowNull: true },
      ...AUDIT_COLUMNS,
    },
    { tableName: "supplier_stock_item", timestamps: false }
  );
}

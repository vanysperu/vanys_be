import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

export type InvoiceType = "issued" | "purchase";
export type InvoiceDriveStatus = "none" | "pending" | "copied" | "failed";
export type InvoiceCurrency = "PEN" | "USD";

// Factura (pedido explícito del usuario): la emitida al cerrar una cotización
// o la recibida al comprar. Su archivo (foto WEBP o PDF) puede faltar: esas
// forman la lista de "facturas que faltan subir".
export interface InvoiceAttributes {
  id: number;
  company_id: number;
  business_unit_id: number | null;
  type: InvoiceType;
  quotation_id: number;
  // Datos de la factura de compra (Sprint 2, ítem 3, D9: opcionales).
  supplier_id: number | null;
  series_number: string | null;
  issue_date: string | null;
  currency: InvoiceCurrency | null;
  total: number | null;
  description: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  file_uploaded_at: Date | null;
  file_uploaded_by: number | null;
  // Hay copia en el sistema (invoice_file).
  stored_in_system: boolean;
  drive_status: InvoiceDriveStatus;
  drive_file_id: string | null;
  drive_error: string | null;
  drive_attempts: number;
  drive_next_attempt_at: Date | null;
  created_by: number | null;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface InvoiceModel extends Model<InvoiceAttributes>, InvoiceAttributes {}

export class Invoice extends Model<InvoiceAttributes, InvoiceModel> {}

export type InvoiceStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): InvoiceModel;
};

export function InvoiceFactory(sequelize: Sequelize): InvoiceStatic {
  return <InvoiceStatic>sequelize.define(
    "invoice",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      business_unit_id: { type: DataTypes.BIGINT, allowNull: true },
      type: { type: DataTypes.ENUM("issued", "purchase"), allowNull: false },
      quotation_id: { type: DataTypes.BIGINT, allowNull: false },
      supplier_id: { type: DataTypes.BIGINT, allowNull: true },
      series_number: { type: DataTypes.STRING(30), allowNull: true },
      issue_date: { type: DataTypes.DATEONLY, allowNull: true },
      currency: { type: DataTypes.ENUM("PEN", "USD"), allowNull: true },
      total: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      description: { type: DataTypes.STRING(255), allowNull: false },
      file_name: { type: DataTypes.STRING(255), allowNull: true },
      mime_type: { type: DataTypes.STRING(100), allowNull: true },
      size_bytes: { type: DataTypes.INTEGER, allowNull: true },
      file_uploaded_at: { type: DataTypes.DATE, allowNull: true },
      file_uploaded_by: { type: DataTypes.BIGINT, allowNull: true },
      stored_in_system: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      drive_status: { type: DataTypes.ENUM("none", "pending", "copied", "failed"), allowNull: false, defaultValue: "none" },
      drive_file_id: { type: DataTypes.STRING(128), allowNull: true },
      drive_error: { type: DataTypes.STRING(500), allowNull: true },
      drive_attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      drive_next_attempt_at: { type: DataTypes.DATE, allowNull: true },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    { tableName: "invoice", timestamps: false }
  );
}

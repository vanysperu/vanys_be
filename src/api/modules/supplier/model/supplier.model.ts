import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

// Proveedor de una empresa (plan Sprint 2 §3.2, decisión D7: módulo mínimo).
// Lo usan los códigos de producto y las fuentes de stock (ítem 6), y después
// las facturas de compra (3), los ingresos de almacén (2) y la GRE (1).
export interface SupplierAttributes {
  id: number;
  company_id: number;
  // Fila del catálogo document_type (RUC, DNI...), opcional.
  document_type: number | null;
  document_number: string | null;
  name: string;
  trade_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  // Transportista (para la guía de remisión).
  is_carrier: boolean;
  mtc_registration: string | null;
  active: boolean;
  created_by: number | null;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface SupplierModel extends Model<SupplierAttributes>, SupplierAttributes {}

export type SupplierStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): SupplierModel;
};

export function SupplierFactory(sequelize: Sequelize): SupplierStatic {
  return <SupplierStatic>sequelize.define(
    "supplier",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      document_type: { type: DataTypes.BIGINT, allowNull: true },
      document_number: { type: DataTypes.STRING(20), allowNull: true },
      name: { type: DataTypes.STRING(200), allowNull: false },
      trade_name: { type: DataTypes.STRING(200), allowNull: true },
      email: { type: DataTypes.STRING(150), allowNull: true },
      phone: { type: DataTypes.STRING(30), allowNull: true },
      address: { type: DataTypes.STRING(255), allowNull: true },
      is_carrier: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      mtc_registration: { type: DataTypes.STRING(30), allowNull: true },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    { tableName: "supplier", timestamps: false }
  );
}

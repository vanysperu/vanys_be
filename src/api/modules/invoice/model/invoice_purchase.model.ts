import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

// Compras que cubre una factura de compra (una factura → varias compras; cada
// compra, a lo sumo en una factura). Migración 20261108100000-invoice-purchases.js.
export interface InvoicePurchaseAttributes {
  id: number;
  invoice_id: number;
  purchase_id: number;
  company_id: number;
  created_by: number | null;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface InvoicePurchaseModel extends Model<InvoicePurchaseAttributes>, InvoicePurchaseAttributes {}

export class InvoicePurchase extends Model<InvoicePurchaseAttributes, InvoicePurchaseModel> {}

export type InvoicePurchaseStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): InvoicePurchaseModel;
};

export function InvoicePurchaseFactory(sequelize: Sequelize): InvoicePurchaseStatic {
  return <InvoicePurchaseStatic>sequelize.define(
    "invoice_purchase",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      invoice_id: { type: DataTypes.BIGINT, allowNull: false },
      purchase_id: { type: DataTypes.BIGINT, allowNull: false, unique: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    { tableName: "invoice_purchase", timestamps: false }
  );
}

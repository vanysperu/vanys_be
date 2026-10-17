import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

export type FundingSource = "company" | "employee";

export interface PurchaseOrderItemPurchaseAttributes {
  id: number;
  purchase_order_item_id: number;
  quotation_expense_id: number;
  quantity: number;
  amount: number;
  // "company" = flujo normal (plata de la empresa). "employee" = el
  // trabajador pagó de su bolsillo — genera una fila en employee_debt con
  // paid_by_user_id como acreedor (ver purchase_order_item_purchase.service.ts).
  funding_source: FundingSource;
  paid_by_user_id: number | null;
  created_by: number | null;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface PurchaseOrderItemPurchasePartialAttributes extends Partial<PurchaseOrderItemPurchaseAttributes> {}

export interface PurchaseOrderItemPurchaseModel
  extends Model<PurchaseOrderItemPurchaseAttributes>,
    PurchaseOrderItemPurchaseAttributes {}

export class PurchaseOrderItemPurchase extends Model<
  PurchaseOrderItemPurchaseAttributes,
  PurchaseOrderItemPurchaseModel
> {}

export type PurchaseOrderItemPurchaseStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): PurchaseOrderItemPurchaseModel;
};

export function PurchaseOrderItemPurchaseFactory(sequelize: Sequelize): PurchaseOrderItemPurchaseStatic {
  return <PurchaseOrderItemPurchaseStatic>sequelize.define(
    "purchase_order_item_purchase",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      purchase_order_item_id: { type: DataTypes.BIGINT, allowNull: false },
      quotation_expense_id: { type: DataTypes.BIGINT, allowNull: false },
      quantity: { type: DataTypes.INTEGER, allowNull: false },
      amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      funding_source: { type: DataTypes.ENUM("company", "employee"), allowNull: false, defaultValue: "company" },
      paid_by_user_id: { type: DataTypes.BIGINT, allowNull: true },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "purchase_order_item_purchase",
      timestamps: false,
    }
  );
}

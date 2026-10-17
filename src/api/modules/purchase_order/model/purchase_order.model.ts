import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

export type PurchaseOrderStatus = "pending" | "purchased";

export const PURCHASE_ORDER_STATUSES: PurchaseOrderStatus[] = ["pending", "purchased"];

export interface PurchaseOrderAttributes {
  id: number;
  company_id: number;
  quotation_id: number;
  assigned_to: number;
  status: PurchaseOrderStatus;
  notes: string | null;
  purchased_at: Date | null;
  created_by: number | null;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface PurchaseOrderPartialAttributes extends Partial<PurchaseOrderAttributes> {}

export interface PurchaseOrderModel extends Model<PurchaseOrderAttributes>, PurchaseOrderAttributes {}

export class PurchaseOrder extends Model<PurchaseOrderAttributes, PurchaseOrderModel> {}

export type PurchaseOrderStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): PurchaseOrderModel;
};

export function PurchaseOrderFactory(sequelize: Sequelize): PurchaseOrderStatic {
  return <PurchaseOrderStatic>sequelize.define(
    "purchase_order",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      quotation_id: { type: DataTypes.BIGINT, allowNull: false },
      assigned_to: { type: DataTypes.BIGINT, allowNull: false },
      status: { type: DataTypes.ENUM(...PURCHASE_ORDER_STATUSES), allowNull: false, defaultValue: "pending" },
      notes: { type: DataTypes.TEXT, allowNull: true },
      purchased_at: { type: DataTypes.DATE, allowNull: true },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "purchase_order",
      timestamps: false,
    }
  );
}

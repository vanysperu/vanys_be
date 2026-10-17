import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

export type PurchaseOrderItemStatus = "pending" | "purchased" | "not_needed";

export const PURCHASE_ORDER_ITEM_STATUSES: PurchaseOrderItemStatus[] = ["pending", "purchased", "not_needed"];

export interface PurchaseOrderItemAttributes {
  id: number;
  purchase_order_id: number;
  quotation_item_id: number;
  quantity: number;
  status: PurchaseOrderItemStatus;
  created_by: number | null;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface PurchaseOrderItemPartialAttributes extends Partial<PurchaseOrderItemAttributes> {}

export interface PurchaseOrderItemModel extends Model<PurchaseOrderItemAttributes>, PurchaseOrderItemAttributes {}

export class PurchaseOrderItem extends Model<PurchaseOrderItemAttributes, PurchaseOrderItemModel> {}

export type PurchaseOrderItemStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): PurchaseOrderItemModel;
};

export function PurchaseOrderItemFactory(sequelize: Sequelize): PurchaseOrderItemStatic {
  return <PurchaseOrderItemStatic>sequelize.define(
    "purchase_order_item",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      purchase_order_id: { type: DataTypes.BIGINT, allowNull: false },
      quotation_item_id: { type: DataTypes.BIGINT, allowNull: false },
      quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      status: { type: DataTypes.ENUM(...PURCHASE_ORDER_ITEM_STATUSES), allowNull: false, defaultValue: "pending" },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "purchase_order_item",
      timestamps: false,
    }
  );
}

import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

export interface QuotationPaymentAttributes {
  id: number;
  quotation_id: number;
  amount: number;
  method: string | null;
  paid_at: string;
  notes: string | null;
  operation_number: string | null;
  is_deleted: boolean;
  created_by: number | null;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface QuotationPaymentPartialAttributes extends Partial<QuotationPaymentAttributes> {}

export interface QuotationPaymentModel extends Model<QuotationPaymentAttributes>, QuotationPaymentAttributes {}

export class QuotationPayment extends Model<QuotationPaymentAttributes, QuotationPaymentModel> {}

export type QuotationPaymentStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): QuotationPaymentModel;
};

export function QuotationPaymentFactory(sequelize: Sequelize): QuotationPaymentStatic {
  return <QuotationPaymentStatic>sequelize.define(
    "quotation_payment",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      quotation_id: { type: DataTypes.BIGINT, allowNull: false },
      amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      method: { type: DataTypes.STRING(50), allowNull: true },
      paid_at: { type: DataTypes.DATEONLY, allowNull: false },
      notes: { type: DataTypes.TEXT, allowNull: true },
      operation_number: { type: DataTypes.STRING(50), allowNull: true },
      is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "quotation_payment",
      timestamps: false,
    }
  );
}

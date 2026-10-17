import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

export interface QuotationExpenseAttributes {
  id: number;
  quotation_id: number;
  description: string;
  amount: number;
  category: string | null;
  spent_at: string;
  created_by: number | null;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface QuotationExpensePartialAttributes extends Partial<QuotationExpenseAttributes> {}

export interface QuotationExpenseModel extends Model<QuotationExpenseAttributes>, QuotationExpenseAttributes {}

export class QuotationExpense extends Model<QuotationExpenseAttributes, QuotationExpenseModel> {}

export type QuotationExpenseStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): QuotationExpenseModel;
};

export function QuotationExpenseFactory(sequelize: Sequelize): QuotationExpenseStatic {
  return <QuotationExpenseStatic>sequelize.define(
    "quotation_expense",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      quotation_id: { type: DataTypes.BIGINT, allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: false },
      amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      category: { type: DataTypes.STRING(50), allowNull: true },
      spent_at: { type: DataTypes.DATEONLY, allowNull: false },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "quotation_expense",
      timestamps: false,
    }
  );
}

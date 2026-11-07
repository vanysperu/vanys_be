import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";
import { FundingSource } from "../../purchase_order/model/purchase_order_item_purchase.model";

export interface QuotationExpenseAttributes {
  id: number;
  quotation_id: number;
  description: string;
  amount: number;
  category: string | null;
  spent_at: string;
  // Quién puso la plata de un gasto manual (la deuda sale de employee_debt). En
  // el gasto de una compra no se usa: manda la compra.
  funding_source: FundingSource;
  // Cuenta de la empresa desde la que se pagó (null = efectivo). Un gasto de
  // una compra pagada con plata de un trabajador no la usa: ese dinero sale
  // de la empresa recién al reponerle (employee_debt_payment).
  payment_account_id: number | null;
  // N.° de operación del pago (opcional). Una compra con plata de un trabajador
  // no lo lleva: va en su reposición, que es cuando sale el dinero.
  operation_number: string | null;
  // Gasto anulado (registrado por error): deja de sumar en Caja, márgenes y
  // totales. Una compra de orden anulada anula también su gasto.
  is_deleted: boolean;
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
      funding_source: { type: DataTypes.ENUM("company", "employee"), allowNull: false, defaultValue: "company" },
      payment_account_id: { type: DataTypes.BIGINT, allowNull: true },
      operation_number: { type: DataTypes.STRING(50), allowNull: true },
      is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
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

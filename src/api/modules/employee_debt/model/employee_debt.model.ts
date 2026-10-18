import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

export type EmployeeDebtStatus = "pending" | "paid";

export interface EmployeeDebtAttributes {
  id: number;
  company_id: number;
  user_id: number;
  purchase_order_item_purchase_id: number;
  amount: number;
  status: EmployeeDebtStatus;
  paid_at: string | null;
  // Cuenta de la empresa (general_variable category="payment_account") desde
  // la que se le repuso el dinero al trabajador; null = efectivo.
  payment_account_id: number | null;
  created_by: number | null;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface EmployeeDebtPartialAttributes extends Partial<EmployeeDebtAttributes> {}

export interface EmployeeDebtModel extends Model<EmployeeDebtAttributes>, EmployeeDebtAttributes {}

export class EmployeeDebt extends Model<EmployeeDebtAttributes, EmployeeDebtModel> {}

export type EmployeeDebtStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): EmployeeDebtModel;
};

export function EmployeeDebtFactory(sequelize: Sequelize): EmployeeDebtStatic {
  return <EmployeeDebtStatic>sequelize.define(
    "employee_debt",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      user_id: { type: DataTypes.BIGINT, allowNull: false },
      purchase_order_item_purchase_id: { type: DataTypes.BIGINT, allowNull: false, unique: true },
      amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      status: { type: DataTypes.ENUM("pending", "paid"), allowNull: false, defaultValue: "pending" },
      paid_at: { type: DataTypes.DATEONLY, allowNull: true },
      payment_account_id: { type: DataTypes.BIGINT, allowNull: true },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "employee_debt",
      timestamps: false,
    }
  );
}

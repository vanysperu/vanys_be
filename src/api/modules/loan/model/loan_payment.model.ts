import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

// Cobro de un préstamo (21-nov): se reparte en capital (vuelve a la caja, no
// es ingreso) e interés (ingreso de la empresa). amount = principal_part + interest_part.
export interface LoanPaymentAttributes {
  id: number;
  loan_id: number;
  company_id: number;
  business_unit_id: number | null;
  amount: number;
  principal_part: number;
  interest_part: number;
  paid_at: string;
  // Cuenta a la que entró el dinero (null = efectivo).
  payment_account_id: number | null;
  operation_number: string | null;
  notes: string | null;
  active: boolean;
  created_by: number;
  created_at: Date;
  updated_by: number;
  updated_at: Date;
}

export interface LoanPaymentModel extends Model<LoanPaymentAttributes>, LoanPaymentAttributes {}

export class LoanPayment extends Model<LoanPaymentAttributes, LoanPaymentModel> {}

export type LoanPaymentStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): LoanPaymentModel;
};

export function LoanPaymentFactory(sequelize: Sequelize): LoanPaymentStatic {
  return <LoanPaymentStatic>sequelize.define(
    "loan_payment",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      loan_id: { type: DataTypes.BIGINT, allowNull: false },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      business_unit_id: { type: DataTypes.BIGINT, allowNull: true },
      amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      principal_part: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      interest_part: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      paid_at: { type: DataTypes.DATEONLY, allowNull: false },
      payment_account_id: { type: DataTypes.BIGINT, allowNull: true },
      operation_number: { type: DataTypes.STRING(50), allowNull: true },
      notes: { type: DataTypes.STRING(500), allowNull: true },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_by: { type: DataTypes.BIGINT, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_by: { type: DataTypes.BIGINT, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    { tableName: "loan_payment", timestamps: false }
  );
}

import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

// Préstamo de la empresa a una persona (pedido del usuario, 21-nov). Interés
// simple, una sola vez sobre el capital: total_due = principal + interest_amount.
export interface LoanAttributes {
  id: number;
  company_id: number;
  business_unit_id: number | null;
  borrower_name: string;
  borrower_document: string | null;
  borrower_phone: string | null;
  principal: number;
  interest_rate: number;
  interest_amount: number;
  total_due: number;
  loaned_at: string;
  due_date: string | null;
  // Cuenta por la que salió el dinero (null = efectivo).
  payment_account_id: number | null;
  operation_number: string | null;
  notes: string | null;
  active: boolean;
  created_by: number;
  created_at: Date;
  updated_by: number;
  updated_at: Date;
}

export interface LoanModel extends Model<LoanAttributes>, LoanAttributes {}

export class Loan extends Model<LoanAttributes, LoanModel> {}

export type LoanStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): LoanModel;
};

export function LoanFactory(sequelize: Sequelize): LoanStatic {
  return <LoanStatic>sequelize.define(
    "loan",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      business_unit_id: { type: DataTypes.BIGINT, allowNull: true },
      borrower_name: { type: DataTypes.STRING(150), allowNull: false },
      borrower_document: { type: DataTypes.STRING(20), allowNull: true },
      borrower_phone: { type: DataTypes.STRING(20), allowNull: true },
      principal: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      interest_rate: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 0 },
      interest_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      total_due: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      loaned_at: { type: DataTypes.DATEONLY, allowNull: false },
      due_date: { type: DataTypes.DATEONLY, allowNull: true },
      payment_account_id: { type: DataTypes.BIGINT, allowNull: true },
      operation_number: { type: DataTypes.STRING(50), allowNull: true },
      notes: { type: DataTypes.STRING(500), allowNull: true },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_by: { type: DataTypes.BIGINT, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_by: { type: DataTypes.BIGINT, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    { tableName: "loan", timestamps: false }
  );
}

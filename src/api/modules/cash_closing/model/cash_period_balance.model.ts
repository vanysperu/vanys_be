import { BuildOptions, DataTypes, Model, Optional, Sequelize } from "sequelize";

// Foto de UNA cuenta en un mes cerrado. La base exige
// closing = opening + income - expense + transfers + adjustments (CHECK,
// migración 20261110100000-create-cash-transfer.js). Un re-cierre actualiza
// las filas existentes e inserta cuentas nuevas; nunca borra (una cuenta que
// queda en cero conserva su fila en cero).
export interface CashPeriodBalanceAttributes {
  id: number;
  company_id: number;
  cash_period_id: number;
  account_key: number; // 0 = Efectivo
  payment_account_id: number | null;
  account_name: string; // nombre al cerrar
  opening: number;
  income: number;
  expense: number;
  // Transferencias entre cuentas del mes (neto con signo; 0 en cierres viejos).
  transfers: number;
  adjustments: number;
  closing: number;
  created_by: number;
  created_at: Date;
  updated_by: number;
  updated_at: Date;
}

// Al crear, el id lo asigna la base.
export type CashPeriodBalanceCreationAttributes = Optional<CashPeriodBalanceAttributes, "id">;

export interface CashPeriodBalanceModel extends Model<CashPeriodBalanceAttributes, CashPeriodBalanceCreationAttributes>, CashPeriodBalanceAttributes {}

export class CashPeriodBalance extends Model<CashPeriodBalanceAttributes, CashPeriodBalanceModel> {}

export type CashPeriodBalanceStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): CashPeriodBalanceModel;
};

const money = () => ({ type: DataTypes.DECIMAL(14, 2), allowNull: false });

export function CashPeriodBalanceFactory(sequelize: Sequelize): CashPeriodBalanceStatic {
  return <CashPeriodBalanceStatic>sequelize.define(
    "cash_period_balance",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      cash_period_id: { type: DataTypes.BIGINT, allowNull: false },
      account_key: { type: DataTypes.BIGINT, allowNull: false },
      payment_account_id: { type: DataTypes.BIGINT, allowNull: true },
      account_name: { type: DataTypes.STRING(150), allowNull: false },
      opening: money(),
      income: money(),
      expense: money(),
      transfers: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      adjustments: money(),
      closing: money(),
      created_by: { type: DataTypes.BIGINT, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_by: { type: DataTypes.BIGINT, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    { tableName: "cash_period_balance", timestamps: false }
  );
}

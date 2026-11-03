import { BuildOptions, DataTypes, Model, Optional, Sequelize } from "sequelize";
import { CASH_PERIOD_STORED_STATUSES, CashPeriodStoredStatus } from "../types/cash_closing.types";

// Un mes de caja que se cerró al menos una vez. Un mes SIN fila está abierto.
// Los totales son la suma de cash_period_balance del mismo mes.
export interface CashPeriodAttributes {
  id: number;
  company_id: number;
  period: string; // YYYY-MM
  period_start: string; // DATEONLY
  period_end: string; // DATEONLY
  status: CashPeriodStoredStatus;
  opening_total: number;
  income_total: number;
  expense_total: number;
  adjustment_total: number;
  closing_total: number;
  close_count: number;
  closed_by: number;
  closed_at: Date; // último cierre
  close_notes: string | null;
  reopened_by: number | null;
  reopened_at: Date | null;
  reopen_reason: string | null;
  created_by: number;
  created_at: Date;
  updated_by: number;
  updated_at: Date;
}

// Al crear, el id lo asigna la base.
export type CashPeriodCreationAttributes = Optional<CashPeriodAttributes, "id">;

export interface CashPeriodModel extends Model<CashPeriodAttributes, CashPeriodCreationAttributes>, CashPeriodAttributes {}

export class CashPeriod extends Model<CashPeriodAttributes, CashPeriodModel> {}

export type CashPeriodStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): CashPeriodModel;
};

const money = () => ({ type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 });

export function CashPeriodFactory(sequelize: Sequelize): CashPeriodStatic {
  return <CashPeriodStatic>sequelize.define(
    "cash_period",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      period: { type: DataTypes.CHAR(7), allowNull: false },
      period_start: { type: DataTypes.DATEONLY, allowNull: false },
      period_end: { type: DataTypes.DATEONLY, allowNull: false },
      status: { type: DataTypes.ENUM(...CASH_PERIOD_STORED_STATUSES), allowNull: false },
      opening_total: money(),
      income_total: money(),
      expense_total: money(),
      adjustment_total: money(),
      closing_total: money(),
      close_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      closed_by: { type: DataTypes.BIGINT, allowNull: false },
      closed_at: { type: DataTypes.DATE, allowNull: false },
      close_notes: { type: DataTypes.STRING(500), allowNull: true },
      reopened_by: { type: DataTypes.BIGINT, allowNull: true },
      reopened_at: { type: DataTypes.DATE, allowNull: true },
      reopen_reason: { type: DataTypes.STRING(500), allowNull: true },
      created_by: { type: DataTypes.BIGINT, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_by: { type: DataTypes.BIGINT, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    { tableName: "cash_period", timestamps: false }
  );
}

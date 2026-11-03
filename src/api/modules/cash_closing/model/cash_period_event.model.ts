import { BuildOptions, DataTypes, Model, Optional, Sequelize } from "sequelize";
import {
  CASH_PERIOD_EVENT_ACTIONS,
  CashPeriodEventAction,
  CashPeriodEventSnapshot,
} from "../types/cash_closing.types";

// Rastro inmutable del cierre: saldo inicial, cierres, re-cierres,
// reaperturas y recálculos. Se inserta una vez y nunca se edita ni se borra.
// En MariaDB JSON es LONGTEXT: al leer, parsear si llega como texto.
export interface CashPeriodEventAttributes {
  id: number;
  company_id: number;
  period: string | null; // null en eventos de saldo inicial
  action: CashPeriodEventAction;
  reason: string | null;
  previous_snapshot: CashPeriodEventSnapshot | null;
  snapshot: CashPeriodEventSnapshot;
  created_by: number;
  created_at: Date;
  updated_by: number;
  updated_at: Date;
}

// Al crear, el id lo asigna la base.
export type CashPeriodEventCreationAttributes = Optional<CashPeriodEventAttributes, "id">;

export interface CashPeriodEventModel extends Model<CashPeriodEventAttributes, CashPeriodEventCreationAttributes>, CashPeriodEventAttributes {}

export class CashPeriodEvent extends Model<CashPeriodEventAttributes, CashPeriodEventModel> {}

export type CashPeriodEventStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): CashPeriodEventModel;
};

export function CashPeriodEventFactory(sequelize: Sequelize): CashPeriodEventStatic {
  return <CashPeriodEventStatic>sequelize.define(
    "cash_period_event",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      period: { type: DataTypes.CHAR(7), allowNull: true },
      action: { type: DataTypes.ENUM(...CASH_PERIOD_EVENT_ACTIONS), allowNull: false },
      reason: { type: DataTypes.STRING(500), allowNull: true },
      previous_snapshot: { type: DataTypes.JSON, allowNull: true },
      snapshot: { type: DataTypes.JSON, allowNull: false },
      created_by: { type: DataTypes.BIGINT, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_by: { type: DataTypes.BIGINT, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    { tableName: "cash_period_event", timestamps: false }
  );
}

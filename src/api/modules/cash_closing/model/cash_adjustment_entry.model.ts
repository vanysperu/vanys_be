import { BuildOptions, DataTypes, Model, Optional, Sequelize } from "sequelize";
import { MONEY_CORRECTION_SOURCES, MoneyCorrectionSource } from "../../money_correction/types/money_correction.types";
import { CASH_ADJUSTMENT_LEGS, CashAdjustmentLegType, CashDirection } from "../types/cash_closing.types";

// Pata de un ajuste por corregir/anular/restaurar una fila de un mes CERRADO
// (inmutable). Siempre de a pares por clave (cuenta/tienda/cotización/orden):
//   hold    = fecha original, mantiene el mes cerrado tal como se cerró;
//   posting = fecha del día en que se corrigió, lleva la diferencia al mes abierto.
// La suma de las dos es 0. El padre (money_correction kind='adjustment') lleva
// el motivo y los valores antes/después.
export interface CashAdjustmentEntryAttributes {
  id: number;
  company_id: number;
  business_unit_id: number | null;
  money_correction_id: number;
  source_type: MoneyCorrectionSource;
  source_id: number; // id de la fila de Caja (compra = quotation_expense_id)
  leg: CashAdjustmentLegType;
  affected_period: string; // YYYY-MM
  entry_date: string; // DATEONLY
  direction: CashDirection;
  amount: number; // DECIMAL(12,2) con signo, relativo a direction; nunca 0
  payment_account_id: number | null;
  quotation_id: number | null;
  purchase_order_id: number | null;
  created_by: number;
  created_at: Date;
  updated_by: number;
  updated_at: Date;
}

// Al crear, el id lo asigna la base.
export type CashAdjustmentEntryCreationAttributes = Optional<CashAdjustmentEntryAttributes, "id">;

export interface CashAdjustmentEntryModel extends Model<CashAdjustmentEntryAttributes, CashAdjustmentEntryCreationAttributes>, CashAdjustmentEntryAttributes {}

export class CashAdjustmentEntry extends Model<CashAdjustmentEntryAttributes, CashAdjustmentEntryModel> {}

export type CashAdjustmentEntryStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): CashAdjustmentEntryModel;
};

export function CashAdjustmentEntryFactory(sequelize: Sequelize): CashAdjustmentEntryStatic {
  return <CashAdjustmentEntryStatic>sequelize.define(
    "cash_adjustment_entry",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      business_unit_id: { type: DataTypes.BIGINT, allowNull: true },
      money_correction_id: { type: DataTypes.BIGINT, allowNull: false },
      source_type: { type: DataTypes.ENUM(...MONEY_CORRECTION_SOURCES), allowNull: false },
      source_id: { type: DataTypes.BIGINT, allowNull: false },
      leg: { type: DataTypes.ENUM(...CASH_ADJUSTMENT_LEGS), allowNull: false },
      affected_period: { type: DataTypes.CHAR(7), allowNull: false },
      entry_date: { type: DataTypes.DATEONLY, allowNull: false },
      direction: { type: DataTypes.ENUM("income", "expense"), allowNull: false },
      amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      payment_account_id: { type: DataTypes.BIGINT, allowNull: true },
      quotation_id: { type: DataTypes.BIGINT, allowNull: true },
      purchase_order_id: { type: DataTypes.BIGINT, allowNull: true },
      created_by: { type: DataTypes.BIGINT, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_by: { type: DataTypes.BIGINT, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    { tableName: "cash_adjustment_entry", timestamps: false }
  );
}

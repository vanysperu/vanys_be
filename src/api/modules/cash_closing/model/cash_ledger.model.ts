import { BuildOptions, DataTypes, Model, Optional, Sequelize } from "sequelize";

// Libro de caja de UNA empresa (migración 20261102100000-create-cash-closing.js).
// Es a la vez la fila de lock del cierre: toda escritura de dinero la toma
// LOCK IN SHARE MODE y el cierre/reapertura/saldo inicial FOR UPDATE.
// Sin fila = la empresa no configuró la caja: no hay ninguna restricción.
export interface CashLedgerAttributes {
  id: number;
  company_id: number;
  start_period: string; // YYYY-MM
  start_date: string; // primer día de start_period (DATEONLY)
  notes: string | null;
  created_by: number;
  created_at: Date;
  updated_by: number;
  updated_at: Date;
}

// Al crear, el id lo asigna la base.
export type CashLedgerCreationAttributes = Optional<CashLedgerAttributes, "id">;

export interface CashLedgerModel extends Model<CashLedgerAttributes, CashLedgerCreationAttributes>, CashLedgerAttributes {}

export class CashLedger extends Model<CashLedgerAttributes, CashLedgerModel> {}

export type CashLedgerStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): CashLedgerModel;
};

export function CashLedgerFactory(sequelize: Sequelize): CashLedgerStatic {
  return <CashLedgerStatic>sequelize.define(
    "cash_ledger",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false, unique: true },
      start_period: { type: DataTypes.CHAR(7), allowNull: false },
      start_date: { type: DataTypes.DATEONLY, allowNull: false },
      notes: { type: DataTypes.STRING(500), allowNull: true },
      created_by: { type: DataTypes.BIGINT, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_by: { type: DataTypes.BIGINT, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    { tableName: "cash_ledger", timestamps: false }
  );
}

import { BuildOptions, DataTypes, Model, Optional, Sequelize } from "sequelize";

// Saldo inicial DECLARADO por un administrador para una cuenta, a las 00:00
// de cash_ledger.start_date. account_key = 0 para Efectivo, si no el id de la
// cuenta (la base lo exige con un CHECK).
export interface CashLedgerOpeningAttributes {
  id: number;
  company_id: number;
  cash_ledger_id: number;
  account_key: number;
  payment_account_id: number | null;
  account_name: string; // nombre de la cuenta al guardar (foto)
  amount: number; // DECIMAL(14,2), puede ser negativo
  history_amount: number | null; // informativo: neto de Caja antes de start_date
  created_by: number;
  created_at: Date;
  updated_by: number;
  updated_at: Date;
}

// Al crear, el id lo asigna la base.
export type CashLedgerOpeningCreationAttributes = Optional<CashLedgerOpeningAttributes, "id">;

export interface CashLedgerOpeningModel extends Model<CashLedgerOpeningAttributes, CashLedgerOpeningCreationAttributes>, CashLedgerOpeningAttributes {}

export class CashLedgerOpening extends Model<CashLedgerOpeningAttributes, CashLedgerOpeningModel> {}

export type CashLedgerOpeningStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): CashLedgerOpeningModel;
};

export function CashLedgerOpeningFactory(sequelize: Sequelize): CashLedgerOpeningStatic {
  return <CashLedgerOpeningStatic>sequelize.define(
    "cash_ledger_opening",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      cash_ledger_id: { type: DataTypes.BIGINT, allowNull: false },
      account_key: { type: DataTypes.BIGINT, allowNull: false },
      payment_account_id: { type: DataTypes.BIGINT, allowNull: true },
      account_name: { type: DataTypes.STRING(150), allowNull: false },
      amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      history_amount: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
      created_by: { type: DataTypes.BIGINT, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_by: { type: DataTypes.BIGINT, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    { tableName: "cash_ledger_opening", timestamps: false }
  );
}

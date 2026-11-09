import { BuildOptions, DataTypes, Model, Optional, Sequelize } from "sequelize";

// Transferencia entre dos cuentas de la MISMA empresa: el dinero sale de
// `from_payment_account_id` y entra a `to_payment_account_id` el mismo día y
// por el mismo monto (null = Efectivo). No es ingreso ni egreso de la empresa:
// solo cambia en qué cuenta está la plata. Ver README del módulo.
export interface CashTransferAttributes {
  id: number;
  company_id: number;
  business_unit_id: number | null;
  from_payment_account_id: number | null;
  to_payment_account_id: number | null;
  amount: number;
  occurred_at: string; // YYYY-MM-DD (día calendario de Lima)
  description: string | null;
  operation_number: string | null;
  is_deleted: boolean;
  created_by: number;
  created_at: Date;
  updated_by: number;
  updated_at: Date;
}

// Al crear, el id lo asigna la base.
export type CashTransferCreationAttributes = Optional<CashTransferAttributes, "id">;

export interface CashTransferModel extends Model<CashTransferAttributes, CashTransferCreationAttributes>, CashTransferAttributes {}

export class CashTransfer extends Model<CashTransferAttributes, CashTransferModel> {}

export type CashTransferStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): CashTransferModel;
};

export function CashTransferFactory(sequelize: Sequelize): CashTransferStatic {
  return <CashTransferStatic>sequelize.define(
    "cash_transfer",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      business_unit_id: { type: DataTypes.BIGINT, allowNull: true },
      from_payment_account_id: { type: DataTypes.BIGINT, allowNull: true },
      to_payment_account_id: { type: DataTypes.BIGINT, allowNull: true },
      amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      occurred_at: { type: DataTypes.DATEONLY, allowNull: false },
      description: { type: DataTypes.STRING(500), allowNull: true },
      operation_number: { type: DataTypes.STRING(50), allowNull: true },
      is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      created_by: { type: DataTypes.BIGINT, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_by: { type: DataTypes.BIGINT, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    { tableName: "cash_transfer", timestamps: false }
  );
}

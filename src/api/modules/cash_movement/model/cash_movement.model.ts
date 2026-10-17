import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

export type CashMovementDirection = "income" | "expense";

export interface CashMovementAttributes {
  id: number;
  company_id: number;
  business_unit_id: number | null;
  direction: CashMovementDirection;
  // prefix_id de general_variable (categoría "cash_movement_type") — mismo
  // criterio que quotation_payment.method/quotation_expense.category.
  category: string;
  amount: number;
  description: string | null;
  occurred_at: string;
  // Vínculo opcional a una cotización u orden de compra (pedido explícito
  // del usuario) — NUNCA se usa para duplicar un pago/gasto que ya se
  // registra en sus propias tablas, solo para dar contexto a un movimiento
  // manual que de todas formas está relacionado a ese trabajo puntual.
  quotation_id: number | null;
  purchase_order_id: number | null;
  is_deleted: boolean;
  created_by: number | null;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface CashMovementPartialAttributes extends Partial<CashMovementAttributes> {}

export interface CashMovementModel extends Model<CashMovementAttributes>, CashMovementAttributes {}

export class CashMovement extends Model<CashMovementAttributes, CashMovementModel> {}

export type CashMovementStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): CashMovementModel;
};

export function CashMovementFactory(sequelize: Sequelize): CashMovementStatic {
  return <CashMovementStatic>sequelize.define(
    "cash_movement",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      business_unit_id: { type: DataTypes.BIGINT, allowNull: true },
      direction: { type: DataTypes.ENUM("income", "expense"), allowNull: false },
      category: { type: DataTypes.STRING(50), allowNull: false },
      amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      description: { type: DataTypes.STRING(500), allowNull: true },
      occurred_at: { type: DataTypes.DATEONLY, allowNull: false },
      quotation_id: { type: DataTypes.BIGINT, allowNull: true },
      purchase_order_id: { type: DataTypes.BIGINT, allowNull: true },
      is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "cash_movement",
      timestamps: false,
    }
  );
}

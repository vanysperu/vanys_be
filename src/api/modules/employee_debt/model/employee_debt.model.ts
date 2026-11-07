import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

// "cancelled": deuda MANUAL anulada antes de reponerse (registrada por
// error). Las deudas de compras nunca se anulan desde acá.
export type EmployeeDebtStatus = "pending" | "paid" | "cancelled";

// "purchase": nace sola al registrar una compra de orden pagada con plata
// del trabajador. "manual": la registra un administrador para gastos fuera
// de una orden (ej. el trabajador pagó la luz con su plata). "expense": nace
// sola al registrar un gasto de cotización pagado con plata del trabajador.
export type EmployeeDebtOrigin = "purchase" | "manual" | "expense";

export interface EmployeeDebtAttributes {
  id: number;
  company_id: number;
  user_id: number;
  origin: EmployeeDebtOrigin;
  // Solo en origin="purchase" (en las manuales es null).
  purchase_order_item_purchase_id: number | null;
  // Solo en origin="expense".
  quotation_expense_id: number | null;
  // Solo en origin="manual": qué se pagó y de qué tipo de gasto (catálogo
  // cash_movement_type, el mismo de Caja).
  description: string | null;
  category: string | null;
  // Tienda a la que corresponde una deuda manual (las de compras la toman
  // de su cotización).
  business_unit_id: number | null;
  // Día (Lima) en que el trabajador puso el dinero.
  incurred_at: string;
  amount: number;
  // Cuánto se le repuso YA de esta fila (0 <= paid_amount <= amount). La
  // fila sigue "pending" mientras paid_amount < amount (admite abonos
  // parciales); el monto realmente pendiente es siempre amount - paid_amount.
  paid_amount: number;
  status: EmployeeDebtStatus;
  // Fecha de la última reposición vigente que cubrió esta fila (se
  // recalcula si se anula una reposición).
  paid_at: string | null;
  // Histórico: antes de employee_debt_payment, aquí se anotaba la cuenta del
  // último abono. Ya no se escribe ni se usa para Caja — la cuenta de cada
  // reposición vive en employee_debt_payment.
  payment_account_id: number | null;
  created_by: number | null;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface EmployeeDebtPartialAttributes extends Partial<EmployeeDebtAttributes> {}

export interface EmployeeDebtModel extends Model<EmployeeDebtAttributes>, EmployeeDebtAttributes {}

export class EmployeeDebt extends Model<EmployeeDebtAttributes, EmployeeDebtModel> {}

export type EmployeeDebtStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): EmployeeDebtModel;
};

export function EmployeeDebtFactory(sequelize: Sequelize): EmployeeDebtStatic {
  return <EmployeeDebtStatic>sequelize.define(
    "employee_debt",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      user_id: { type: DataTypes.BIGINT, allowNull: false },
      origin: { type: DataTypes.ENUM("purchase", "manual", "expense"), allowNull: false, defaultValue: "purchase" },
      purchase_order_item_purchase_id: { type: DataTypes.BIGINT, allowNull: true, unique: true },
      quotation_expense_id: { type: DataTypes.BIGINT, allowNull: true, unique: true },
      description: { type: DataTypes.STRING(300), allowNull: true },
      category: { type: DataTypes.STRING(50), allowNull: true },
      business_unit_id: { type: DataTypes.BIGINT, allowNull: true },
      incurred_at: { type: DataTypes.DATEONLY, allowNull: false },
      amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      paid_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      status: { type: DataTypes.ENUM("pending", "paid", "cancelled"), allowNull: false, defaultValue: "pending" },
      paid_at: { type: DataTypes.DATEONLY, allowNull: true },
      payment_account_id: { type: DataTypes.BIGINT, allowNull: true },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "employee_debt",
      timestamps: false,
    }
  );
}

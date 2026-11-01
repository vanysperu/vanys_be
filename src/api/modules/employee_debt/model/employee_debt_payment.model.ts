import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

// Una reposición a un trabajador: el dinero que la empresa le devuelve por
// compras que pagó con su plata. ES el egreso de Caja de esas compras (la
// compra en sí no mueve la caja de la empresa). Puede cubrir varias deudas,
// total o parcialmente (ver employee_debt_payment_allocation). Nunca se
// edita ni se borra: si se registró por error, se anula (is_deleted) y las
// deudas que cubría vuelven a quedar pendientes.
export interface EmployeeDebtPaymentAttributes {
  id: number;
  company_id: number;
  // Trabajador al que se le repuso.
  user_id: number;
  amount: number;
  // Cuenta de la empresa desde la que salió el dinero; null = efectivo.
  payment_account_id: number | null;
  // Día calendario de Lima en que salió el dinero.
  paid_at: string;
  is_deleted: boolean;
  created_by: number | null;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface EmployeeDebtPaymentModel extends Model<EmployeeDebtPaymentAttributes>, EmployeeDebtPaymentAttributes {}

export type EmployeeDebtPaymentStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): EmployeeDebtPaymentModel;
};

export function EmployeeDebtPaymentFactory(sequelize: Sequelize): EmployeeDebtPaymentStatic {
  return <EmployeeDebtPaymentStatic>sequelize.define(
    "employee_debt_payment",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      user_id: { type: DataTypes.BIGINT, allowNull: false },
      amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      payment_account_id: { type: DataTypes.BIGINT, allowNull: true },
      paid_at: { type: DataTypes.DATEONLY, allowNull: false },
      is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "employee_debt_payment",
      timestamps: false,
    }
  );
}

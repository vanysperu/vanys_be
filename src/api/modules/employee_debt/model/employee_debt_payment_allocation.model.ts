import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

// Cuánto de una reposición se aplicó a cada deuda. Invariantes (las cuida el
// service, dentro de una transacción con las filas bloqueadas):
//   - la suma de las asignaciones de una reposición = su monto;
//   - la suma de las asignaciones de reposiciones NO anuladas de una deuda =
//     su paid_amount.
// Gracias a esto, anular una reposición devuelve exactamente lo que cubrió.
export interface EmployeeDebtPaymentAllocationAttributes {
  id: number;
  company_id: number;
  employee_debt_payment_id: number;
  employee_debt_id: number;
  amount: number;
  created_by: number | null;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface EmployeeDebtPaymentAllocationModel
  extends Model<EmployeeDebtPaymentAllocationAttributes>,
    EmployeeDebtPaymentAllocationAttributes {}

export type EmployeeDebtPaymentAllocationStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): EmployeeDebtPaymentAllocationModel;
};

export function EmployeeDebtPaymentAllocationFactory(sequelize: Sequelize): EmployeeDebtPaymentAllocationStatic {
  return <EmployeeDebtPaymentAllocationStatic>sequelize.define(
    "employee_debt_payment_allocation",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      employee_debt_payment_id: { type: DataTypes.BIGINT, allowNull: false },
      employee_debt_id: { type: DataTypes.BIGINT, allowNull: false },
      amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "employee_debt_payment_allocation",
      timestamps: false,
    }
  );
}

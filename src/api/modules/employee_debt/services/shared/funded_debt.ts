import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { formatSoles } from "../../../../../core/utils/money";
import { EmployeeDebtModel } from "../../model/employee_debt.model";

// Trabajador que puso la plata: activo y de la MISMA empresa del gasto o la compra.
export const assertEmployeeAvailable = async (userId: number | null, companyId: number, transaction: Transaction) => {
  const employee =
    userId === null ? null : await DataBase.instance.user.findOne({ where: { id: userId }, transaction });
  if (employee && !employee.is_deleted && employee.status && employee.company_id === companyId) return;
  throw new AppError(
    400,
    "El trabajador que puso el dinero no existe, está deshabilitado o no es de esta empresa",
    undefined,
    "EMPLOYEE_NOT_AVAILABLE"
  );
};

export const debtBelowReimbursedError = (debt: EmployeeDebtModel) =>
  new AppError(
    409,
    `Ya se le repuso ${formatSoles(debt.paid_amount)} de esta compra; el monto no puede quedar por debajo. Corrige o anula primero la reposición.`,
    { paid_amount: Number(debt.paid_amount) },
    "DEBT_BELOW_REIMBURSED"
  );

import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { WriteScope } from "../../../../../core/rbac/writeScope";
import { EmployeeDebtModel } from "../../model/employee_debt.model";
import { EmployeeDebtPaymentModel } from "../../model/employee_debt_payment.model";

/**
 * Bloqueo de una reposición para corregirla o anularla: PRIMERO todas las
 * deudas de su trabajador (por id) y DESPUÉS la reposición.
 *
 * Por qué en este orden (y no reposición → deudas): recalculateDebtsState
 * lee las reposiciones con subconsultas dentro de un UPDATE, que en InnoDB
 * (REPEATABLE READ) toman bloqueos compartidos sobre esas filas DESPUÉS de
 * que el caller ya bloqueó sus deudas. Todos los caminos que recalculan
 * (reponer, anular, corregir una deuda manual o una compra) van entonces
 * deudas → reposiciones; si este camino bloqueara la reposición antes que
 * las deudas, una corrección de compra con la deuda tomada y esta
 * corrección con la reposición tomada se esperarían mutuamente
 * (interbloqueo). Con el mismo orden en todos, uno espera y el otro sigue.
 *
 * El trabajador de una reposición no se corrige nunca, así que leerlo antes
 * de bloquear es seguro. Todo lo que se lee después es con bloqueo (lectura
 * de lo último confirmado).
 */
export async function lockWorkerDebtsAndPayment({
  paymentId,
  scope,
  notFoundMessage,
  transaction,
}: {
  paymentId: number;
  scope: WriteScope;
  notFoundMessage: string;
  transaction: Transaction;
}): Promise<{ payment: EmployeeDebtPaymentModel; debts: EmployeeDebtModel[] }> {
  const owner = await DataBase.instance.employee_debt_payment.findOne({
    where: { id: paymentId },
    attributes: ["id", "user_id", "company_id"],
    transaction,
  });
  // Otra empresa responde igual que "no existe": no se confirma que el id exista.
  if (!owner) throw new AppError(404, notFoundMessage);
  if (scope.companyId !== null && Number(owner.company_id) !== scope.companyId) throw new AppError(404, notFoundMessage);

  const debts = await DataBase.instance.employee_debt.findAll({
    where: { user_id: owner.user_id, company_id: owner.company_id },
    order: [["id", "ASC"]],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  const payment = await DataBase.instance.employee_debt_payment.findOne({
    where: { id: paymentId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!payment) throw new AppError(404, notFoundMessage);

  return { payment, debts };
}

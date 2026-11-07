import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { toCents } from "../../../../../core/utils/money";
import { AppError } from "../../../../../core/errors/AppError";
import { EmployeeDebtModel } from "../../../employee_debt/model/employee_debt.model";
import { debtBelowReimbursedError } from "../../../employee_debt/services/shared/funded_debt";
import { debtReimbursedError, liveDebtOf } from "../../../purchase_order/services/shared/purchase_lock.service";
import { FundingSource } from "../../../purchase_order/model/purchase_order_item_purchase.model";

const EXPENSE_SUBJECT = "este gasto";

// Lo que la deuda tiene que reflejar de su gasto.
export interface ExpenseDebtTarget {
  funding_source: FundingSource;
  paid_by_user_id: number | null;
  amount: number;
  spent_at: string;
}

// Siempre después de bloquear el gasto: mismo orden gasto → deuda que una compra.
export const lockExpenseDebt = (expenseId: number, transaction: Transaction): Promise<EmployeeDebtModel | null> =>
  DataBase.instance.employee_debt.findOne({
    where: { quotation_expense_id: expenseId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

// Ya se le repuso algo: no se le puede quitar la deuda ni bajarla por debajo de
// lo repuesto sin anular antes esa reposición. Mismas reglas que una compra.
export const assertExpenseDebtAllowsChange = async (
  debt: EmployeeDebtModel | null,
  previous: ExpenseDebtTarget,
  next: ExpenseDebtTarget,
  transaction: Transaction
): Promise<void> => {
  const liveDebt = liveDebtOf(debt);
  const paidCents = liveDebt ? toCents(liveDebt.paid_amount) : 0;
  if (!liveDebt || paidCents === 0) return;
  if (next.funding_source === "company") throw await debtReimbursedError(liveDebt, transaction, EXPENSE_SUBJECT);
  if (next.paid_by_user_id !== previous.paid_by_user_id) throw await debtReimbursedError(liveDebt, transaction, EXPENSE_SUBJECT);
  if (toCents(next.amount) < paidCents) throw debtBelowReimbursedError(liveDebt);
};

// Anular un gasto ya repuesto dejaría plata pagada sin gasto que la justifique.
export const assertExpenseDebtNotReimbursed = async (debt: EmployeeDebtModel | null, transaction: Transaction): Promise<void> => {
  const liveDebt = liveDebtOf(debt);
  if (liveDebt && toCents(liveDebt.paid_amount) > 0) throw await debtReimbursedError(liveDebt, transaction, EXPENSE_SUBJECT);
};

/**
 * Deja la deuda cumpliendo el invariante: gasto con plata de un trabajador →
 * exactamente UNA deuda vigente con el monto y la fecha del gasto; con plata de
 * la empresa → ninguna vigente. quotation_expense_id es UNIQUE: si el gasto ya
 * tuvo una deuda anulada, se reactiva esa fila. Devuelve la deuda tocada, para
 * recalcular su estado.
 */
export const syncExpenseDebt = async ({
  expenseId,
  companyId,
  debt,
  target,
  actorId,
  transaction,
}: {
  expenseId: number;
  companyId: number;
  debt: EmployeeDebtModel | null;
  target: ExpenseDebtTarget;
  actorId: number | null;
  transaction: Transaction;
}): Promise<number | null> => {
  const now = nowUtc();
  const audit = { updated_by: actorId, updated_at: now };
  const liveDebt = liveDebtOf(debt);

  if (target.funding_source === "company") {
    if (!liveDebt) return null;
    await DataBase.instance.employee_debt.update({ status: "cancelled", ...audit }, { where: { id: liveDebt.id }, transaction });
    return liveDebt.id;
  }

  const userId = target.paid_by_user_id;
  if (userId === null) throw new AppError(400, "Indica qué trabajador puso el dinero", undefined, "EMPLOYEE_NOT_AVAILABLE");
  const fields = { user_id: userId, amount: target.amount, incurred_at: target.spent_at, ...audit };

  if (liveDebt) {
    await DataBase.instance.employee_debt.update(fields, { where: { id: liveDebt.id }, transaction });
    return liveDebt.id;
  }
  if (debt) {
    await DataBase.instance.employee_debt.update({ ...fields, status: "pending", paid_amount: 0 }, { where: { id: debt.id }, transaction });
    return debt.id;
  }

  const created = await DataBase.instance.employee_debt.create(
    {
      id: 0,
      company_id: companyId,
      user_id: userId,
      origin: "expense",
      purchase_order_item_purchase_id: null,
      quotation_expense_id: expenseId,
      // Qué se pagó y la tienda los da el gasto y su cotización.
      description: null,
      category: null,
      business_unit_id: null,
      incurred_at: target.spent_at,
      amount: target.amount,
      paid_amount: 0,
      status: "pending",
      paid_at: null,
      payment_account_id: null,
      created_by: actorId,
      created_at: now,
      updated_by: actorId,
      updated_at: now,
    },
    { transaction }
  );
  return created.id;
};

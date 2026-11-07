import { DataBase } from "../../../../../database";
import { beginCashChange, toggleAdjustmentValues } from "../../../../../core/money/cashPeriod";
import { MoneyCorrectionKind } from "../../../money_correction/types/money_correction.types";
import { recordMoneyCorrection } from "../../../money_correction/services/create/money_correction.service";
import { cashChangeNote } from "../../../cash_movement/services/update/cash_change_note";
import { WriteScope } from "../../../../../core/rbac/writeScope";
import { formatSoles } from "../../../../../core/utils/money";
import { nowUtc, toDateOnlyString } from "../../../../../utils/dateUtils";
import { createLogService } from "../../../logs/services/create/log.services";
import { LogAction } from "../../../logs/model/log.model";
import { logQuotationEvent, truncateForTimeline } from "../timeline/quotation_event.service";
import { lockManualExpense } from "../update/quotation_expense.service";
import { assertExpenseDebtNotReimbursed, lockExpenseDebt } from "../shared/expense_debt";
import { recalculateDebtsState } from "../../../employee_debt/services/shared/debt_state.service";

export interface ToggleQuotationExpenseResult {
  id: number;
  is_deleted: boolean;
  // 'adjustment' = el gasto era de un mes cerrado (cierre de caja).
  kind: MoneyCorrectionKind;
  adjusted_period: string | null;
}

/**
 * Anula o restaura un gasto MANUAL de una cotización (soft-delete: nunca se
 * borra). Un gasto anulado deja de sumar en Caja, Estadísticas, el margen y
 * el total de la pestaña Gastos (todas esas consultas filtran
 * qe.is_deleted = false). El gasto de una compra no se toca acá: se anula la
 * compra (409 EXPENSE_BELONGS_TO_PURCHASE).
 *
 * Igual que la corrección, se permite en cualquier estado de la cotización:
 * deshacer un registro equivocado no es registrar dinero nuevo.
 */
export async function toggleQuotationExpense({
  expenseId,
  scope,
  updatedBy,
  reason = null,
}: {
  expenseId: number;
  scope: WriteScope;
  updatedBy: number;
  // Motivo del ajuste: solo se usa (y se exige) si el gasto es de un mes cerrado.
  reason?: string | null;
}): Promise<ToggleQuotationExpenseResult> {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const { expense, quotation } = await lockManualExpense(expenseId, scope, transaction);
    const nextDeleted = !expense.is_deleted;
    const paidByEmployee = expense.funding_source === "employee";
    const debt = paidByEmployee ? await lockExpenseDebt(expenseId, transaction) : null;
    if (nextDeleted) await assertExpenseDebtNotReimbursed(debt, transaction);

    // Cierre de caja (fase 2): anular/restaurar un gasto de un mes cerrado
    // es un ajuste (motivo obligatorio); el mes cerrado queda como se cerró.
    const spentAt = toDateOnlyString(expense.spent_at);
    const change = await beginCashChange({
      companyId: quotation.company_id,
      source: "quotation_expense",
      sourceId: expenseId,
      oldDate: spentAt,
      newDate: spentAt,
      movesCashAfter: !nextDeleted && !paidByEmployee,
      scope,
      actorId: updatedBy,
      transaction,
    });

    await DataBase.instance.quotation_expense.update(
      { is_deleted: nextDeleted, updated_by: updatedBy, updated_at: nowUtc() },
      { where: { id: expenseId }, transaction }
    );

    // La deuda sigue al gasto: anulado no se le debe nada; restaurado, sí.
    if (debt) {
      await DataBase.instance.employee_debt.update(
        { status: nextDeleted ? "cancelled" : "pending", updated_by: updatedBy, updated_at: nowUtc() },
        { where: { id: debt.id }, transaction }
      );
      await recalculateDebtsState([debt.id], transaction, updatedBy);
    }

    const cash = await change.complete(async (kind) => {
      // Un anular/restaurar normal no deja historial de corrección.
      if (kind !== "adjustment" || reason === null) return null;
      const { previous, next } = toggleAdjustmentValues(nextDeleted);
      const correction = await recordMoneyCorrection({
        sourceType: "quotation_expense",
        sourceId: expenseId,
        companyId: quotation.company_id,
        businessUnitId: quotation.business_unit_id,
        previous,
        next,
        reason,
        actorId: updatedBy,
        kind,
        transaction,
      });
      return correction.id;
    });

    const verb = nextDeleted ? "anulado" : "restaurado";
    const reasonNote = cash.kind === "adjustment" && reason !== null ? `. Motivo: ${truncateForTimeline(reason)}` : "";
    const summary = `"${truncateForTimeline(expense.description)}" por ${formatSoles(expense.amount)}${cashChangeNote(cash)}${reasonNote}`;
    await logQuotationEvent({
      quotationId: expense.quotation_id,
      action: nextDeleted ? "expense_disabled" : "expense_restored",
      description: `Gasto ${verb}: ${summary}`,
      actorId: updatedBy,
      transaction,
    });
    await createLogService(
      {
        user_id: updatedBy,
        action: nextDeleted ? LogAction.DISABLE : LogAction.ACTIVE,
        module: "quotation",
        description: `Gasto #${expenseId} de la cotización #${expense.quotation_id} ${verb}: ${summary}`,
        company_id: quotation.company_id,
      },
      transaction
    );

    return { id: expenseId, is_deleted: nextDeleted, kind: cash.kind, adjusted_period: cash.adjustedPeriod };
  });
}

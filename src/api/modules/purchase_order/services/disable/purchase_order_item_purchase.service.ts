import { DataBase } from "../../../../../database";
import { beginCashChange, toggleAdjustmentValues } from "../../../../../core/money/cashPeriod";
import { MoneyCorrectionKind } from "../../../money_correction/types/money_correction.types";
import { recordMoneyCorrection } from "../../../money_correction/services/create/money_correction.service";
import { cashChangeNote } from "../../../cash_movement/services/update/cash_change_note";
import { WriteScope } from "../../../../../core/rbac/writeScope";
import { formatSoles } from "../../../../../core/utils/money";
import { nowUtc, toDateOnlyString } from "../../../../../utils/dateUtils";
import { recalculateDebtsState } from "../../../employee_debt/services/shared/debt_state.service";
import { createLogService } from "../../../logs/services/create/log.services";
import { LogAction } from "../../../logs/model/log.model";
import { logQuotationEvent, truncateForTimeline } from "../../../quotation/services/timeline/quotation_event.service";
import { debtReimbursedError, liveDebtOf, lockPurchaseForWrite, purchaseAnnulledError } from "../shared/purchase_lock.service";
import { recalculateItemStatus, recalculatePurchaseOrderStatus } from "../shared/purchase_order_status.service";

export interface AnnulPurchaseResult {
  id: number;
  is_deleted: true;
  // 'adjustment' = la compra (de la empresa) era de un mes cerrado.
  kind: MoneyCorrectionKind;
  adjusted_period: string | null;
}

/**
 * Anula una compra registrada por error (de una sola vía: no se restaura; si
 * hacía falta, se registra de nuevo). En UNA transacción, con todo bloqueado
 * en el orden item → orden → compra → gasto → deuda:
 *   - la compra y su gasto quedan is_deleted (dejan de sumar en Caja,
 *     Estadísticas, márgenes, "Gastado" y la cantidad comprada del item);
 *   - su deuda con el trabajador (si la hay) queda anulada;
 *   - el estado del item y de la orden se recalculan desde la fuente.
 *
 * Si ya se le repuso algo al trabajador por esta compra, se bloquea (409
 * PURCHASE_DEBT_REIMBURSED): primero se anula esa reposición.
 */
export async function annulPurchase({
  purchaseId,
  scope,
  updatedBy,
  reason = null,
}: {
  purchaseId: number;
  scope: WriteScope;
  updatedBy: number;
  // Motivo del ajuste: solo se usa (y se exige) si la compra pagada por la
  // empresa es de un mes cerrado.
  reason?: string | null;
}): Promise<AnnulPurchaseResult> {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const locked = await lockPurchaseForWrite(purchaseId, scope, transaction);
    const { item, purchaseOrder, purchase, expense, productName } = locked;
    if (purchase.is_deleted) throw purchaseAnnulledError();

    const liveDebt = liveDebtOf(locked.debt);
    if (liveDebt && Number(liveDebt.paid_amount) > 0) throw await debtReimbursedError(liveDebt, transaction);

    // Cierre de caja (fase 2): anular una compra pagada por la empresa de un
    // mes cerrado es un ajuste (motivo obligatorio). Una compra del
    // trabajador no mueve caja: nunca deja patas.
    const spentAt = toDateOnlyString(expense.spent_at);
    const change = await beginCashChange({
      companyId: purchaseOrder.company_id,
      source: "quotation_expense",
      sourceId: expense.id,
      oldDate: spentAt,
      newDate: spentAt,
      movesCashAfter: false,
      scope,
      actorId: updatedBy,
      transaction,
    });

    const now = nowUtc();
    const audit = { updated_by: updatedBy, updated_at: now };
    await DataBase.instance.purchase_order_item_purchase.update(
      { is_deleted: true, ...audit },
      { where: { id: purchaseId }, transaction }
    );
    await DataBase.instance.quotation_expense.update({ is_deleted: true, ...audit }, { where: { id: expense.id }, transaction });

    // paid_amount = 0 (validado arriba): anularla no deja nada colgado.
    if (liveDebt) {
      await DataBase.instance.employee_debt.update({ status: "cancelled", ...audit }, { where: { id: liveDebt.id }, transaction });
      await recalculateDebtsState([liveDebt.id], transaction, updatedBy);
    }

    await recalculateItemStatus(item.id, transaction, updatedBy);
    await recalculatePurchaseOrderStatus(purchaseOrder.id, transaction, updatedBy);

    const cash = await change.complete(async (kind) => {
      // Una anulación normal no deja historial de corrección.
      if (kind !== "adjustment" || reason === null) return null;
      const { previous, next } = toggleAdjustmentValues(true);
      const correction = await recordMoneyCorrection({
        sourceType: "quotation_expense",
        sourceId: expense.id,
        companyId: purchaseOrder.company_id,
        businessUnitId: locked.businessUnitId,
        previous,
        next,
        reason,
        actorId: updatedBy,
        kind,
        transaction,
      });
      return correction.id;
    });

    const reasonNote = cash.kind === "adjustment" && reason !== null ? `. Motivo: ${truncateForTimeline(reason)}` : "";
    const summary = `${productName} x${purchase.quantity} por ${formatSoles(purchase.amount)}${cashChangeNote(cash)}${reasonNote}`;
    await logQuotationEvent({
      quotationId: purchaseOrder.quotation_id,
      action: "purchase_disabled",
      description: `Compra anulada: ${summary}`,
      actorId: updatedBy,
      transaction,
    });
    await createLogService(
      {
        user_id: updatedBy,
        action: LogAction.DISABLE,
        module: "purchase_order",
        description: `Anuló la compra #${purchaseId} (gasto #${expense.id}) de la orden #${purchaseOrder.id}: ${summary}${liveDebt ? `; deuda #${liveDebt.id} anulada` : ""}`,
        company_id: purchaseOrder.company_id,
      },
      transaction
    );

    return { id: purchaseId, is_deleted: true, kind: cash.kind, adjusted_period: cash.adjustedPeriod };
  });
}

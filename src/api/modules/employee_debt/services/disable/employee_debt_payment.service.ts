import { DataBase } from "../../../../../database";
import { nowUtc, toDateOnlyString } from "../../../../../utils/dateUtils";
import { formatSoles } from "../../../../../core/utils/money";
import { WriteScope } from "../../../../../core/rbac/writeScope";
import { beginCashChange, toggleAdjustmentValues } from "../../../../../core/money/cashPeriod";
import { recordMoneyCorrection } from "../../../money_correction/services/create/money_correction.service";
import { cashChangeNote } from "../../../cash_movement/services/update/cash_change_note";
import { createLogService } from "../../../logs/services/create/log.services";
import { LogAction } from "../../../logs/model/log.model";
import { EmployeeDebtModel } from "../../model/employee_debt.model";
import { recalculateDebtsState } from "../shared/debt_state.service";
import { assertDebtsInWriteScope } from "../shared/debt_scope.service";
import { lockWorkerDebtsAndPayment } from "../shared/reimbursement_lock.service";

// Se conserva por compatibilidad del controller; el "no existe / fuera de
// alcance" ahora sale como AppError 404 de lockWorkerDebtsAndPayment.
export class EmployeeDebtPaymentNotFoundError extends Error {}
export class EmployeeDebtPaymentAlreadyVoidedError extends Error {}

const NOT_FOUND_MESSAGE = "La reposición no existe";

// Anula una reposición registrada por error. Es de una sola vía (no se
// "reactiva"): si después sí correspondía, se registra una reposición nueva,
// que vuelve a validar contra lo pendiente en ese momento — reactivar una
// vieja podía reponer de más.
//
// En una sola transacción, con las deudas del trabajador y la reposición
// bloqueadas (en ese orden, ver lockWorkerDebtsAndPayment):
//   - la reposición queda anulada; sus asignaciones se conservan (historial)
//     pero dejan de contar;
//   - lo repuesto, el estado y la fecha del último abono de cada deuda que
//     cubría se recalculan desde la fuente (recalculateDebtsState, nunca con
//     restas): una deuda que otra reposición sigue cubriendo por completo
//     queda "pagada", no "pendiente";
//   - queda una fila inmutable en `log` (Caja es un libro contable: mismo
//     criterio que anular un movimiento manual).
const voidEmployeeDebtPayment = async ({
  paymentId,
  scope,
  voidedBy,
  reason = null,
}: {
  paymentId: number;
  scope: WriteScope;
  voidedBy: number;
  // Motivo del ajuste: solo se usa (y se exige) si la reposición es de un mes
  // cerrado (cierre de caja, fase 2).
  reason?: string | null;
}) => {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const { payment, debts } = await lockWorkerDebtsAndPayment({
      paymentId,
      scope,
      notFoundMessage: NOT_FOUND_MESSAGE,
      transaction,
    });
    if (payment.is_deleted) throw new EmployeeDebtPaymentAlreadyVoidedError("Esta reposición ya está anulada");

    const allocations = await DataBase.instance.employee_debt_payment_allocation.findAll({
      where: { employee_debt_payment_id: paymentId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const debtIds = allocations.map((allocation) => Number(allocation.employee_debt_id));
    const debtById = new Map(debts.map((debt) => [debt.id, debt]));
    const coveredDebts = debtIds
      .map((debtId) => debtById.get(debtId))
      .filter((debt): debt is EmployeeDebtModel => debt !== undefined);

    // Un usuario ligado a una tienda solo anula reposiciones que cubren
    // deudas de su tienda.
    // No existe / fuera de alcance = AppError 404 (mismo status que antes).
    await assertDebtsInWriteScope(coveredDebts, scope, NOT_FOUND_MESSAGE, transaction);

    // Cierre de caja (fase 2): anular una reposición de un mes cerrado es un
    // ajuste (motivo obligatorio): patas por cada asignación (tienda de la
    // deuda/cotización), y lo repuesto de cada deuda se recalcula igual.
    const paidAt = toDateOnlyString(payment.paid_at);
    const change = await beginCashChange({
      companyId: payment.company_id,
      source: "employee_debt_payment",
      sourceId: paymentId,
      oldDate: paidAt,
      newDate: paidAt,
      movesCashAfter: false,
      scope,
      actorId: voidedBy,
      transaction,
    });

    await payment.update({ is_deleted: true, updated_by: voidedBy, updated_at: nowUtc() }, { transaction });
    await recalculateDebtsState(debtIds, transaction, voidedBy);

    const cash = await change.complete(async (kind) => {
      // Una anulación normal no deja historial de corrección (solo el log).
      if (kind !== "adjustment" || reason === null) return null;
      const { previous, next } = toggleAdjustmentValues(true);
      const correction = await recordMoneyCorrection({
        sourceType: "employee_debt_payment",
        sourceId: paymentId,
        companyId: payment.company_id,
        // Misma tienda que la corrección de una reposición: puede cubrir
        // deudas de varias tiendas.
        businessUnitId: null,
        previous,
        next,
        reason,
        actorId: voidedBy,
        kind,
        transaction,
      });
      return correction.id;
    });
    const reasonNote = cash.kind === "adjustment" && reason !== null ? `. Motivo: ${reason}` : "";

    await createLogService(
      {
        user_id: voidedBy,
        action: LogAction.DISABLE,
        module: "employee_debt",
        description: `Anuló la reposición #${paymentId} de ${formatSoles(payment.amount)} al trabajador #${payment.user_id} (del ${payment.paid_at})${cashChangeNote(cash)}${reasonNote}`,
        company_id: payment.company_id,
      },
      transaction
    );

    return { id: paymentId, is_deleted: true, kind: cash.kind, adjusted_period: cash.adjustedPeriod };
  });
};

export { voidEmployeeDebtPayment };

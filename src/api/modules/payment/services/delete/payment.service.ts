import { literal } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { beginCashChange, toggleAdjustmentValues } from "../../../../../core/money/cashPeriod";
import { WriteScope } from "../../../../../core/rbac/writeScope";
import { nowUtc, toDateOnlyString } from "../../../../../utils/dateUtils";
import {
  assertPaymentWithinBalance,
  recalculateTotalPaid,
} from "../../../quotation/services/create/quotation_payment.service";
import { logQuotationEvent, truncateForTimeline } from "../../../quotation/services/timeline/quotation_event.service";
import { assertPaymentInWriteScope } from "../shared/payment_scope";
import { recordMoneyCorrection } from "../../../money_correction/services/create/money_correction.service";
import { cashChangeNote } from "../../../cash_movement/services/update/cash_change_note";

// Anular/restaurar un pago (toggle, mismo patrón que cash_movement) — al
// anularlo, recalculateTotalPaid ya lo excluye de la suma (is_deleted=false
// en el WHERE); al restaurarlo, vuelve a sumarse solo.
//
// Orden de locks: cotización -> pago (el mismo que registrar y corregir un
// pago). Antes anular bloqueaba pago -> cotización y podía hacer deadlock
// contra una corrección simultánea del mismo pago.
const disableOrEnablePaymentById = async ({
  paymentId,
  scope,
  updatedBy,
  reason = null,
}: {
  paymentId: number;
  // Alcance de ESCRITURA del usuario (resolveWriteScope).
  scope: WriteScope;
  updatedBy: number;
  // Motivo del ajuste: solo se usa (y se exige) si el pago es de un mes
  // cerrado (cierre de caja, fase 2).
  reason?: string | null;
}) => {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    // Se lee el pago SIN lock solo para saber su cotización.
    const peek = await DataBase.instance.quotation_payment.findOne({ where: { id: paymentId }, transaction });
    if (!peek) throw new AppError(404, "El pago no existe");

    const quotation = await DataBase.instance.quotation.findOne({
      where: { id: peek.quotation_id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!quotation) throw new AppError(404, "El pago no existe");
    assertPaymentInWriteScope(quotation, scope);

    // Fila bloqueada: dos toggles simultáneos no leen el mismo estado previo.
    const payment = await DataBase.instance.quotation_payment.findOne({
      where: { id: paymentId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!payment) throw new AppError(404, "El pago no existe");

    // Anular y restaurar mueven Caja en la fecha del pago: si es de un mes
    // cerrado, se registra como ajuste (motivo obligatorio) y el mes cerrado
    // queda como se cerró (cierre mensual, fase 2).
    const nextIsDeleted = !payment.is_deleted;
    // Auditoría: siempre el usuario real de la sesión, nunca 0.
    const actorId = updatedBy;
    const paidAt = toDateOnlyString(payment.paid_at);
    const change = await beginCashChange({
      companyId: quotation.company_id,
      source: "quotation_payment",
      sourceId: paymentId,
      oldDate: paidAt,
      newDate: paidAt,
      movesCashAfter: !nextIsDeleted,
      scope,
      actorId,
      transaction,
    });

    // Restaurar vuelve a sumar el pago: pasa por las mismas reglas que uno
    // nuevo — antes se podía dejar la cotización sobre-pagada, o con dinero
    // estando ya cerrada, solo con reactivar un pago anulado.
    if (payment.is_deleted) {
      await assertPaymentWithinBalance({
        quotationId: payment.quotation_id,
        amount: Number(payment.amount),
        excludePaymentId: paymentId,
        transaction,
      });
    }

    await DataBase.instance.quotation_payment.update(
      {
        is_deleted: literal("CASE WHEN is_deleted = true THEN false ELSE true END"),
        updated_by: updatedBy,
        updated_at: nowUtc(),
      },
      { where: { id: paymentId }, transaction }
    );

    await recalculateTotalPaid(payment.quotation_id, transaction);

    const cash = await change.complete(async (kind) => {
      // Un anular/restaurar normal no deja historial de corrección.
      if (kind !== "adjustment" || reason === null) return null;
      const { previous, next } = toggleAdjustmentValues(nextIsDeleted);
      const correction = await recordMoneyCorrection({
        sourceType: "quotation_payment",
        sourceId: paymentId,
        companyId: quotation.company_id,
        businessUnitId: quotation.business_unit_id,
        previous,
        next,
        reason,
        actorId,
        kind,
        transaction,
      });
      return correction.id;
    });
    const reasonNote = cash.kind === "adjustment" && reason !== null ? `. Motivo: ${truncateForTimeline(reason)}` : "";

    await logQuotationEvent({
      quotationId: payment.quotation_id,
      action: "payment_disabled",
      description: `Pago #${paymentId} ${payment.is_deleted ? "restaurado" : "anulado"}${cashChangeNote(cash)}${reasonNote}`,
      actorId: updatedBy,
      transaction,
    });

    // Igual que los demás toggles: kind/adjusted_period le dicen al frontend
    // si se registró como ajuste de un mes cerrado.
    const updated = await DataBase.instance.quotation_payment.findOne({ where: { id: paymentId }, transaction });
    return { ...updated?.get({ plain: true }), kind: cash.kind, adjusted_period: cash.adjustedPeriod };
  });
};

export { disableOrEnablePaymentById };

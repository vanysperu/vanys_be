import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { beginCashChange } from "../../../../../core/money/cashPeriod";
import { WriteScope } from "../../../../../core/rbac/writeScope";
import { formatSoles, toCents } from "../../../../../core/utils/money";
import { nowUtc, toDateOnlyString } from "../../../../../utils/dateUtils";
import {
  assertPaymentWithinBalance,
  recalculateTotalPaid,
  resolvePaymentAccountForQuotation,
} from "../../../quotation/services/create/quotation_payment.service";
import { assertQuotationIsActive } from "../../../quotation/services/shared/active_quotation";
import { logQuotationEvent, truncateForTimeline } from "../../../quotation/services/timeline/quotation_event.service";
import { CASH_PAYMENT_METHOD } from "../../../quotation/validators/quotation.validator";
import { QuotationPaymentModel } from "../../../quotation/model/quotation_payment.model";
import { createLogService } from "../../../logs/services/create/log.services";
import { LogAction } from "../../../logs/model/log.model";
import { recordMoneyCorrection } from "../../../money_correction/services/create/money_correction.service";
import { MoneyCorrectionValues } from "../../../money_correction/types/money_correction.types";
import {
  applyRequested,
  assertHasChanges,
  changedFieldsBetween,
  pickFields,
  toMoneyValue,
  toNullableText,
} from "../../../money_correction/services/shared/correction_diff";
import { assertPaymentInWriteScope } from "../shared/payment_scope";
import { cashChangeNote } from "../../../cash_movement/services/update/cash_change_note";

export interface UpdatePaymentInput {
  amount: number;
  method: string;
  paid_at: string;
  notes?: string | null;
  operation_number?: string | null;
  payment_account_id?: number | null;
  reason: string;
}

// Campos corregibles de un pago. `quotation_id` NO está a propósito: pasar un
// pago a otra cotización es anularlo y registrarlo de nuevo.
export const CORRECTABLE_PAYMENT_FIELDS = [
  "amount",
  "method",
  "paid_at",
  "payment_account_id",
  "operation_number",
  "notes",
] as const;

export type CorrectablePaymentField = (typeof CORRECTABLE_PAYMENT_FIELDS)[number];

// Valores "limpios" para comparar antes/después sin falsos cambios.
type PaymentSnapshot = {
  amount: number;
  method: string | null;
  paid_at: string;
  payment_account_id: number | null;
  operation_number: string | null;
  notes: string | null;
};

const snapshotOf = (payment: QuotationPaymentModel): PaymentSnapshot => ({
  amount: toMoneyValue(payment.amount),
  method: payment.method,
  paid_at: toDateOnlyString(payment.paid_at),
  payment_account_id: payment.payment_account_id === null ? null : Number(payment.payment_account_id),
  operation_number: toNullableText(payment.operation_number),
  notes: toNullableText(payment.notes),
});

const accountNameOf = async (accountId: number | null, transaction: Transaction): Promise<string | null> => {
  if (accountId === null) return null;
  const account = await DataBase.instance.variable_general.findOne({ where: { id: accountId }, transaction });
  return account?.name ?? null;
};

// Foto (solo de lo que cambió) para el historial; con la cuenta se guarda
// también su nombre de ese momento.
const buildValues = async (
  snapshot: PaymentSnapshot,
  changed: CorrectablePaymentField[],
  transaction: Transaction
): Promise<MoneyCorrectionValues> => {
  const values: MoneyCorrectionValues = { ...pickFields(snapshot, changed) };
  if (!changed.includes("payment_account_id")) return values;
  return { ...values, payment_account_name: await accountNameOf(snapshot.payment_account_id, transaction) };
};

/**
 * Corrige un pago de cliente ("editar en el lugar + historial inmutable").
 *
 * Contrato: el body trae el pago completo (monto, método, fecha, cuenta, N° de
 * operación, notas) + `reason`. Lo que no cambia no se registra.
 *
 * Todo en UNA transacción con el orden de locks cotización -> pago (el mismo
 * que registrar y anular): fila de la cotización, fila del pago, validaciones,
 * UPDATE, total_paid recalculado desde la fuente (nunca deltas), historial
 * (money_correction), evento de la cotización y log. Si algo falla, no queda
 * nada aplicado.
 */
const updatePaymentById = async ({
  paymentId,
  input,
  scope,
  updatedBy,
}: {
  paymentId: number;
  input: UpdatePaymentInput;
  scope: WriteScope;
  updatedBy: number;
}) => {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    // Primero se lee el pago SIN lock solo para saber su cotización: el orden
    // de locks es cotización -> pago.
    const peek = await DataBase.instance.quotation_payment.findOne({ where: { id: paymentId }, transaction });
    if (!peek) throw new AppError(404, "El pago no existe");

    const quotation = await DataBase.instance.quotation.findOne({
      where: { id: peek.quotation_id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!quotation) throw new AppError(404, "El pago no existe");
    assertPaymentInWriteScope(quotation, scope);

    const payment = await DataBase.instance.quotation_payment.findOne({
      where: { id: paymentId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!payment) throw new AppError(404, "El pago no existe");

    // Uno anulado no suma: corregirlo no cambiaría nada. Primero se restaura.
    if (payment.is_deleted) {
      throw new AppError(409, "Este pago está anulado: restáuralo antes de corregirlo", undefined, "PAYMENT_ANNULLED");
    }

    const previous = snapshotOf(payment);

    // Si se mantiene la misma cuenta que ya tenía, no se revalida: así se
    // puede corregir el monto de un pago viejo aunque esa cuenta se haya
    // deshabilitado después. El efectivo siempre queda sin cuenta (lo fuerza
    // resolvePaymentAccountForQuotation) y salir de efectivo exige cuenta
    // (PAYMENT_ACCOUNT_REQUIRED).
    const keepsSameAccount =
      previous.payment_account_id !== null &&
      input.method !== CASH_PAYMENT_METHOD &&
      Number(input.payment_account_id) === previous.payment_account_id;
    const paymentAccountId = keepsSameAccount
      ? previous.payment_account_id
      : await resolvePaymentAccountForQuotation({
          quotationId: payment.quotation_id,
          accountId: input.payment_account_id,
          method: input.method,
          transaction,
        });

    const next = applyRequested(previous, {
      amount: toMoneyValue(input.amount),
      method: input.method,
      paid_at: input.paid_at,
      payment_account_id: paymentAccountId,
      operation_number: toNullableText(input.operation_number),
      notes: toNullableText(input.notes),
    });
    const changed = changedFieldsBetween(CORRECTABLE_PAYMENT_FIELDS, previous, next);
    assertHasChanges(changed);

    // Subir el monto tiene que respetar el saldo (y que la cotización siga
    // activa); bajarlo siempre se permite, solo se exige cotización activa.
    if (toCents(next.amount) > toCents(previous.amount)) {
      await assertPaymentWithinBalance({
        quotationId: payment.quotation_id,
        amount: next.amount,
        excludePaymentId: paymentId,
        transaction,
      });
    } else {
      await assertQuotationIsActive(payment.quotation_id, "registrar un pago", transaction);
    }

    // Cierre mensual de caja (fase 2): la fecha nueva nunca cae en un mes
    // cerrado (409). Un pago de un mes cerrado se corrige igual en el lugar
    // (total_paid y saldo quedan bien) y, si cambia su efecto en caja, la
    // diferencia se registra como ajuste en el mes abierto (complete).
    const change = await beginCashChange({
      companyId: quotation.company_id,
      source: "quotation_payment",
      sourceId: paymentId,
      oldDate: previous.paid_at,
      newDate: next.paid_at,
      movesCashAfter: true,
      scope,
      actorId: updatedBy,
      transaction,
    });

    // Nunca se tocan created_by/created_at; updated_* siempre.
    await DataBase.instance.quotation_payment.update(
      { ...next, updated_by: updatedBy, updated_at: nowUtc() },
      { where: { id: paymentId }, transaction }
    );

    await recalculateTotalPaid(payment.quotation_id, transaction);

    let correctionId = 0;
    const cash = await change.complete(async (kind) => {
      const correction = await recordMoneyCorrection({
        sourceType: "quotation_payment",
        sourceId: paymentId,
        companyId: quotation.company_id,
        businessUnitId: quotation.business_unit_id,
        previous: await buildValues(previous, changed, transaction),
        next: await buildValues(next, changed, transaction),
        reason: input.reason,
        actorId: updatedBy,
        kind,
        transaction,
      });
      correctionId = correction.id;
      return correction.id;
    });
    const note = cashChangeNote(cash);

    const amountNote =
      previous.amount === next.amount
        ? formatSoles(next.amount)
        : `${formatSoles(previous.amount)} → ${formatSoles(next.amount)}`;
    await logQuotationEvent({
      quotationId: payment.quotation_id,
      action: "payment_updated",
      description: `Pago #${paymentId} corregido (${amountNote})${note}. Motivo: ${truncateForTimeline(input.reason.trim())}`,
      actorId: updatedBy,
      transaction,
    });
    await createLogService(
      {
        user_id: updatedBy,
        action: LogAction.UPDATE,
        module: "payment",
        description: `Corrigió el pago #${paymentId} (${amountNote}; campos: ${changed.join(", ")})${note}. Motivo: ${input.reason.trim()}`,
        company_id: quotation.company_id,
      },
      transaction
    );

    const updated = await DataBase.instance.quotation_payment.findOne({ where: { id: paymentId }, transaction });
    return {
      ...updated?.toJSON(),
      correction_id: correctionId,
      changed_fields: changed,
      kind: cash.kind,
      adjusted_period: cash.adjustedPeriod,
    };
  });
};

export { updatePaymentById };

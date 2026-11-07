import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { formatSoles, fromCents, toCents } from "../../../../../core/utils/money";
import { nowUtc, toDateOnlyString } from "../../../../../utils/dateUtils";
import { WriteScope } from "../../../../../core/rbac/writeScope";
import { beginCashChange } from "../../../../../core/money/cashPeriod";
import { cashChangeNote } from "../../../cash_movement/services/update/cash_change_note";
import { createLogService } from "../../../logs/services/create/log.services";
import { LogAction } from "../../../logs/model/log.model";
import { resolvePaymentAccountId } from "../../../variable_general/services/shared/payment_account.service";
import { recordMoneyCorrection } from "../../../money_correction/services/create/money_correction.service";
import {
  AllocationSnapshot,
  MoneyCorrectionKind,
  MoneyCorrectionValues,
} from "../../../money_correction/types/money_correction.types";
import {
  applyRequested,
  assertHasChanges,
  changedFieldsBetween,
  CorrectionSnapshot,
  pickFields,
  toMoneyValue,
  toNullableId,
  toNullableText,
} from "../../../money_correction/services/shared/correction_diff";
import { EmployeeDebtModel } from "../../model/employee_debt.model";
import { EmployeeDebtPaymentAllocationModel } from "../../model/employee_debt_payment_allocation.model";
import { EmployeeDebtPaymentAttributes } from "../../model/employee_debt_payment.model";
import { recalculateDebtsState } from "../shared/debt_state.service";
import { assertDebtsInWriteScope, filterDebtsInWriteScope } from "../shared/debt_scope.service";
import { AllocationChange, planReallocation } from "../shared/reimbursement_allocation";
import { lockWorkerDebtsAndPayment } from "../shared/reimbursement_lock.service";

// Campos de una reposición que se pueden corregir. El trabajador NO: una
// reposición al trabajador equivocado se anula y se registra la correcta.
export const CORRECTABLE_REIMBURSEMENT_FIELDS = ["amount", "paid_at", "payment_account_id", "operation_number"] as const;

export type CorrectableReimbursementField = (typeof CORRECTABLE_REIMBURSEMENT_FIELDS)[number];

type ReimbursementSnapshot = CorrectionSnapshot<CorrectableReimbursementField>;

// `undefined` = se queda como está; payment_account_id null = efectivo.
export interface CorrectReimbursementInput {
  amount?: number | string;
  paid_at?: string;
  payment_account_id?: number | string | null;
  operation_number?: string | null;
  reason: string;
}

export interface CorrectReimbursementResult {
  id: number;
  correction_id: number;
  changed_fields: CorrectableReimbursementField[];
  // Cómo quedó repartida la reposición entre las deudas.
  allocations: AllocationSnapshot[];
  // 'adjustment' = la reposición era de un mes cerrado y la diferencia se
  // registró como ajuste en el mes abierto (cierre de caja).
  kind: MoneyCorrectionKind;
  adjusted_period: string | null;
}

const NOT_FOUND_MESSAGE = "La reposición no existe";

const snapshotOf = (payment: {
  amount: number;
  paid_at: string;
  payment_account_id: number | null;
  operation_number: string | null;
}): ReimbursementSnapshot => ({
  amount: toMoneyValue(payment.amount),
  paid_at: toDateOnlyString(payment.paid_at),
  payment_account_id: toNullableId(payment.payment_account_id),
  operation_number: toNullableText(payment.operation_number),
});

const requestedOf = (input: CorrectReimbursementInput): Partial<ReimbursementSnapshot> => ({
  amount: input.amount === undefined ? undefined : toMoneyValue(input.amount),
  paid_at: input.paid_at,
  payment_account_id: input.payment_account_id === undefined ? undefined : toNullableId(input.payment_account_id),
  operation_number: input.operation_number === undefined ? undefined : toNullableText(input.operation_number),
});

// Columnas a actualizar, ya con el tipo de la tabla (solo lo que cambió).
const paymentChangesOf = (
  next: ReimbursementSnapshot,
  changed: readonly CorrectableReimbursementField[]
): Partial<Pick<EmployeeDebtPaymentAttributes, "amount" | "paid_at" | "payment_account_id" | "operation_number">> => ({
  ...(changed.includes("amount") ? { amount: Number(next.amount) } : {}),
  ...(changed.includes("paid_at") ? { paid_at: String(next.paid_at) } : {}),
  ...(changed.includes("payment_account_id") ? { payment_account_id: toNullableId(next.payment_account_id) } : {}),
  ...(changed.includes("operation_number") ? { operation_number: toNullableText(String(next.operation_number ?? "")) } : {}),
});

// Orden de antigüedad de una deuda (el mismo de reponer: FIFO).
const byAge = (left: EmployeeDebtModel, right: EmployeeDebtModel): number =>
  new Date(left.created_at).getTime() - new Date(right.created_at).getTime() || left.id - right.id;

const roomCentsOf = (debt: EmployeeDebtModel): number =>
  debt.status === "cancelled" ? 0 : toCents(debt.amount) - toCents(debt.paid_amount);

const toSnapshots = (entries: readonly { debtId: number; cents: number }[]): AllocationSnapshot[] =>
  entries
    .filter((entry) => entry.cents > 0)
    .map((entry) => ({ employee_debt_id: entry.debtId, amount: fromCents(entry.cents) }))
    .sort((left, right) => left.employee_debt_id - right.employee_debt_id);

/**
 * Nuevo reparto de la reposición entre las deudas del trabajador. Las deudas
 * candidatas (las que esta reposición todavía no cubre) son las pendientes
 * del trabajador dentro del alcance de escritura del usuario: un usuario
 * ligado a una tienda solo reparte entre deudas de su tienda.
 */
const planNewAllocations = async ({
  debts,
  allocations,
  targetCents,
  scope,
  transaction,
}: {
  debts: EmployeeDebtModel[];
  allocations: EmployeeDebtPaymentAllocationModel[];
  targetCents: number;
  scope: WriteScope;
  transaction: Transaction;
}): Promise<AllocationChange[]> => {
  const currentByDebt = new Map(allocations.map((allocation) => [Number(allocation.employee_debt_id), toCents(allocation.amount)]));
  const ordered = [...debts].sort(byAge);
  const covered = ordered
    .filter((debt) => currentByDebt.has(debt.id))
    .map((debt) => ({ debtId: debt.id, currentCents: currentByDebt.get(debt.id) ?? 0, roomCents: roomCentsOf(debt) }));
  const pending = ordered.filter((debt) => !currentByDebt.has(debt.id) && debt.status === "pending");
  const candidates = (await filterDebtsInWriteScope(pending, scope, transaction)).map((debt) => ({
    debtId: debt.id,
    roomCents: roomCentsOf(debt),
  }));

  const plan = planReallocation({ covered, candidates, targetCents });
  if (plan.ok) return plan.changes;
  throw new AppError(
    400,
    `Con este monto se le repondría más de lo que se le debe: la reposición puede ser como máximo de ${formatSoles(fromCents(plan.maxCents))}`,
    undefined,
    "REIMBURSEMENT_EXCEEDS_PENDING"
  );
};

// Escribe el nuevo reparto. Orden pensado para los CHECK de la base: una
// asignación que queda en 0 se BORRA (CHECK amount > 0), las demás se
// actualizan o se crean con su monto final; paid_amount de cada deuda no se
// toca acá (lo recalcula recalculateDebtsState al final, desde la fuente,
// cuando ya todo cuadra), así ningún estado intermedio viola
// paid_amount <= amount.
const applyAllocationChanges = async ({
  changes,
  allocations,
  paymentId,
  companyId,
  actorId,
  transaction,
}: {
  changes: AllocationChange[];
  allocations: EmployeeDebtPaymentAllocationModel[];
  paymentId: number;
  companyId: number;
  actorId: number;
  transaction: Transaction;
}): Promise<void> => {
  const byDebt = new Map(allocations.map((allocation) => [Number(allocation.employee_debt_id), allocation]));
  const now = nowUtc();

  for (const change of changes.filter((item) => item.afterCents !== item.beforeCents)) {
    const existing = byDebt.get(change.debtId);
    if (existing && change.afterCents === 0) {
      await existing.destroy({ transaction });
      continue;
    }
    if (existing) {
      await existing.update({ amount: fromCents(change.afterCents), updated_by: actorId, updated_at: now }, { transaction });
      continue;
    }
    await DataBase.instance.employee_debt_payment_allocation.create(
      {
        id: 0,
        company_id: companyId,
        employee_debt_payment_id: paymentId,
        employee_debt_id: change.debtId,
        amount: fromCents(change.afterCents),
        created_by: actorId,
        created_at: now,
        updated_by: actorId,
        updated_at: now,
      },
      { transaction }
    );
  }
};

const accountNameOf = async (accountId: number | null, transaction: Transaction): Promise<string | null> => {
  if (accountId === null) return null;
  const account = await DataBase.instance.variable_general.findOne({ where: { id: accountId }, transaction });
  return account?.name ?? null;
};

// Foto del historial: solo lo que cambió, con el nombre de la cuenta del
// momento y, si cambió el monto, el reparto completo entre deudas.
const buildValues = async (
  snapshot: ReimbursementSnapshot,
  changed: CorrectableReimbursementField[],
  allocations: AllocationSnapshot[],
  transaction: Transaction
): Promise<MoneyCorrectionValues> => {
  const values: MoneyCorrectionValues = pickFields(snapshot, changed);
  const withAccount = changed.includes("payment_account_id")
    ? { ...values, payment_account_name: await accountNameOf(toNullableId(snapshot.payment_account_id), transaction) }
    : values;
  return changed.includes("amount") ? { ...withAccount, allocations } : withAccount;
};

/**
 * Corrige una reposición a un trabajador (monto, fecha y cuenta) en el
 * lugar, con historial inmutable (money_correction, fuente
 * "employee_debt_payment").
 *
 * Caja muestra la reposición como la suma de sus asignaciones, con su fecha
 * y su cuenta (cash_flow.sql.ts, REIMBURSEMENT_*): por eso el reparto se
 * rehace para que Σ asignaciones = monto nuevo, y lo repuesto de cada deuda
 * (paid_amount, status, paid_at) se recalcula desde la fuente.
 *
 * Bloqueo: deudas del trabajador (por id) → reposición. Ver
 * lockWorkerDebtsAndPayment: es el mismo orden en que recalculateDebtsState
 * lee las reposiciones, y así no hay interbloqueos con reponer, anular ni
 * con las correcciones de compras.
 */
const correctEmployeeDebtPayment = async ({
  paymentId,
  input,
  scope,
  actorId,
}: {
  paymentId: number;
  input: CorrectReimbursementInput;
  scope: WriteScope;
  actorId: number;
}): Promise<CorrectReimbursementResult> => {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const { payment, debts } = await lockWorkerDebtsAndPayment({ paymentId, scope, notFoundMessage: NOT_FOUND_MESSAGE, transaction });
    if (payment.is_deleted) {
      throw new AppError(409, "Esta reposición está anulada: registra una nueva", undefined, "REIMBURSEMENT_ANNULLED");
    }

    const allocations = await DataBase.instance.employee_debt_payment_allocation.findAll({
      where: { employee_debt_payment_id: paymentId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const debtById = new Map(debts.map((debt) => [debt.id, debt]));
    const coveredDebts = allocations
      .map((allocation) => debtById.get(Number(allocation.employee_debt_id)))
      .filter((debt): debt is EmployeeDebtModel => debt !== undefined);
    // Una reposición vigente solo cubre deudas de su trabajador; si alguna
    // asignación apunta afuera, el dato está roto y no se toca.
    if (coveredDebts.length !== allocations.length) {
      throw new AppError(409, "El reparto de esta reposición no coincide con las deudas del trabajador", undefined, "REIMBURSEMENT_INCONSISTENT");
    }
    await assertDebtsInWriteScope(coveredDebts, scope, NOT_FOUND_MESSAGE, transaction);

    const previous = snapshotOf(payment);
    const next = applyRequested(previous, requestedOf(input));
    const changed = changedFieldsBetween(CORRECTABLE_REIMBURSEMENT_FIELDS, previous, next);
    assertHasChanges(changed);

    // Conservar la misma cuenta se permite aunque se haya deshabilitado
    // después; una cuenta NUEVA tiene que ser de la empresa y estar activa.
    if (changed.includes("payment_account_id") && next.payment_account_id !== null) {
      await resolvePaymentAccountId({
        accountId: next.payment_account_id,
        companyId: payment.company_id,
        required: false,
        transaction,
      });
    }

    // Cierre de caja (fase 2): la fecha nueva nunca cae en un mes cerrado
    // (409). Una reposición de un mes cerrado se corrige en el lugar (lo
    // repuesto de cada deuda queda bien) y la diferencia en caja va como
    // ajuste, con patas por asignación (tienda de cada deuda).
    const change = await beginCashChange({
      companyId: payment.company_id,
      source: "employee_debt_payment",
      sourceId: paymentId,
      oldDate: String(previous.paid_at),
      newDate: String(next.paid_at),
      movesCashAfter: true,
      scope,
      actorId,
      transaction,
    });

    const beforeAllocations = toSnapshots(
      allocations.map((allocation) => ({ debtId: Number(allocation.employee_debt_id), cents: toCents(allocation.amount) }))
    );
    const changes = changed.includes("amount")
      ? await planNewAllocations({ debts, allocations, targetCents: toCents(Number(next.amount)), scope, transaction })
      : [];
    await applyAllocationChanges({ changes, allocations, paymentId, companyId: payment.company_id, actorId, transaction });
    const afterAllocations = changed.includes("amount")
      ? toSnapshots(changes.map((change) => ({ debtId: change.debtId, cents: change.afterCents })))
      : beforeAllocations;

    // Nunca se tocan created_by/created_at; updated_* siempre.
    await payment.update({ ...paymentChangesOf(next, changed), updated_by: actorId, updated_at: nowUtc() }, { transaction });

    // Lo repuesto, el estado y la fecha del último abono de cada deuda
    // afectada (las que cubría y las que cubre ahora), desde la fuente.
    const affectedDebtIds = [
      ...beforeAllocations.map((allocation) => allocation.employee_debt_id),
      ...afterAllocations.map((allocation) => allocation.employee_debt_id),
    ];
    await recalculateDebtsState(affectedDebtIds, transaction, actorId);

    let correctionId = 0;
    const cash = await change.complete(async (kind) => {
      const correction = await recordMoneyCorrection({
        sourceType: "employee_debt_payment",
        sourceId: paymentId,
        companyId: payment.company_id,
        businessUnitId: null,
        previous: await buildValues(previous, changed, beforeAllocations, transaction),
        next: await buildValues(next, changed, afterAllocations, transaction),
        reason: input.reason,
        actorId,
        kind,
        transaction,
      });
      correctionId = correction.id;
      return correction.id;
    });

    const amountNote =
      previous.amount === next.amount
        ? formatSoles(Number(next.amount))
        : `${formatSoles(Number(previous.amount))} → ${formatSoles(Number(next.amount))}`;
    await createLogService(
      {
        user_id: actorId,
        action: LogAction.UPDATE,
        module: "employee_debt",
        description: `Corrigió la reposición #${paymentId} al trabajador #${payment.user_id} (${amountNote}; campos: ${changed.join(", ")})${cashChangeNote(cash)}. Motivo: ${input.reason.trim()}`,
        company_id: payment.company_id,
      },
      transaction
    );

    return {
      id: paymentId,
      correction_id: correctionId,
      changed_fields: changed,
      allocations: afterAllocations,
      kind: cash.kind,
      adjusted_period: cash.adjustedPeriod,
    };
  });
};

export { correctEmployeeDebtPayment };

import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { beginCashChange } from "../../../../../core/money/cashPeriod";
import { isOutOfWriteScope, WriteScope } from "../../../../../core/rbac/writeScope";
import { formatSoles } from "../../../../../core/utils/money";
import { nowUtc, toDateOnlyString } from "../../../../../utils/dateUtils";
import { createLogService } from "../../../logs/services/create/log.services";
import { LogAction } from "../../../logs/model/log.model";
import { recordMoneyCorrection } from "../../../money_correction/services/create/money_correction.service";
import {
  applyRequested,
  assertHasChanges,
  changedFieldsBetween,
  pickFields,
  toMoneyValue,
  toNullableId,
  toNullableText,
} from "../../../money_correction/services/shared/correction_diff";
import { MoneyCorrectionKind, MoneyCorrectionValues } from "../../../money_correction/types/money_correction.types";
import { resolvePaymentAccountId } from "../../../variable_general/services/shared/payment_account.service";
import { QuotationExpenseModel } from "../../model/quotation_expense.model";
import { logQuotationEvent, truncateForTimeline } from "../timeline/quotation_event.service";
import { cashChangeNote } from "../../../cash_movement/services/update/cash_change_note";
import { EmployeeDebtModel } from "../../../employee_debt/model/employee_debt.model";
import { recalculateDebtsState } from "../../../employee_debt/services/shared/debt_state.service";
import { assertEmployeeAvailable } from "../../../employee_debt/services/shared/funded_debt";
import { FundingSource } from "../../../purchase_order/model/purchase_order_item_purchase.model";
import { liveDebtOf, userDisplayName } from "../../../purchase_order/services/shared/purchase_lock.service";
import { assertExpenseDebtAllowsChange, lockExpenseDebt, syncExpenseDebt } from "../shared/expense_debt";

// Campos corregibles de un gasto MANUAL. La cotización no (el gasto sería de
// otra cotización: se anula y se registra en la correcta).
export const CORRECTABLE_EXPENSE_FIELDS = [
  "amount",
  "description",
  "category",
  "spent_at",
  "funding_source",
  "paid_by_user_id",
  "payment_account_id",
  "operation_number",
] as const;

export type CorrectableExpenseField = (typeof CORRECTABLE_EXPENSE_FIELDS)[number];

// Valores normalizados (sin falsos cambios: 10 vs "10.00", "" vs null). Tipo
// alias (no interface) para que encaje en CorrectionSnapshot de correction_diff.
type ExpenseSnapshot = {
  amount: number;
  description: string;
  category: string | null;
  spent_at: string;
  funding_source: FundingSource;
  // Vive en su deuda, no en el gasto.
  paid_by_user_id: number | null;
  payment_account_id: number | null;
  operation_number: string | null;
};

// Igual que pickFields de correction_diff pero conservando el tipo de cada
// campo (lo necesita el UPDATE tipado de Sequelize).
const pickTyped = <K extends CorrectableExpenseField>(snapshot: ExpenseSnapshot, fields: readonly K[]): Partial<ExpenseSnapshot> =>
  fields.reduce<Partial<ExpenseSnapshot>>((picked, field) => ({ ...picked, [field]: snapshot[field] }), {});
// `undefined` = se queda como está; `null` en categoría/cuenta = se limpia
// (sin categoría / efectivo). El validator ya revisó la forma.
export interface CorrectQuotationExpenseInput {
  amount?: number | string;
  description?: string;
  category?: string | null;
  spent_at?: string;
  funding_source?: FundingSource;
  paid_by_user_id?: number | string | null;
  payment_account_id?: number | string | null;
  operation_number?: string | null;
  reason: string;
}

export interface CorrectQuotationExpenseResult {
  id: number;
  correction_id: number;
  changed_fields: CorrectableExpenseField[];
  // 'adjustment' = el gasto era de un mes cerrado y la diferencia se
  // registró como ajuste en el mes abierto (cierre de caja).
  kind: MoneyCorrectionKind;
  adjusted_period: string | null;
}

const snapshotOf = (expense: QuotationExpenseModel, debt: EmployeeDebtModel | null): ExpenseSnapshot => ({
  amount: toMoneyValue(expense.amount),
  description: expense.description.trim(),
  category: toNullableText(expense.category),
  spent_at: toDateOnlyString(expense.spent_at),
  funding_source: expense.funding_source,
  paid_by_user_id: toNullableId(liveDebtOf(debt)?.user_id ?? null),
  payment_account_id: toNullableId(expense.payment_account_id),
  operation_number: toNullableText(expense.operation_number),
});

const requestedOf = (input: CorrectQuotationExpenseInput): Partial<ExpenseSnapshot> => ({
  amount: input.amount === undefined ? undefined : toMoneyValue(input.amount),
  description: input.description === undefined ? undefined : input.description.trim(),
  category: input.category === undefined ? undefined : toNullableText(input.category),
  spent_at: input.spent_at,
  funding_source: input.funding_source,
  payment_account_id: input.payment_account_id === undefined ? undefined : toNullableId(input.payment_account_id),
  operation_number: input.operation_number === undefined ? undefined : toNullableText(input.operation_number),
});

/**
 * Foto pedida, con las mismas reglas de quién puso la plata que una compra:
 *   - plata de la empresa: sin trabajador.
 *   - plata de un trabajador: sin cuenta ni n.° de operación (mandarlos → 400); el
 *     trabajador es el pedido, el de antes o, si pasa desde "empresa" sin
 *     indicarlo, quien corrige. El n.° de operación irá en su reposición.
 */
const requestedSnapshot = (previous: ExpenseSnapshot, input: CorrectQuotationExpenseInput, actorId: number): ExpenseSnapshot => {
  const base = applyRequested(previous, requestedOf(input));
  const requestedPaidBy = input.paid_by_user_id === undefined ? undefined : toNullableId(input.paid_by_user_id);

  if (base.funding_source === "company") {
    if (requestedPaidBy !== undefined && requestedPaidBy !== null) {
      throw new AppError(400, "Un gasto pagado por la empresa no lleva trabajador que lo pagó", undefined, "PAID_BY_NOT_ALLOWED");
    }
    return { ...base, paid_by_user_id: null };
  }

  if (input.payment_account_id !== undefined && toNullableId(input.payment_account_id) !== null) {
    throw new AppError(400, "Un gasto pagado con plata de un trabajador no sale de una cuenta de la empresa", undefined, "PAYMENT_ACCOUNT_NOT_ALLOWED");
  }
  if (input.operation_number !== undefined && toNullableText(input.operation_number) !== null) {
    throw new AppError(400, "Un gasto pagado con plata de un trabajador no lleva número de operación: va en su reposición", undefined, "OPERATION_NUMBER_NOT_ALLOWED");
  }
  return {
    ...base,
    payment_account_id: null,
    operation_number: null,
    paid_by_user_id: requestedPaidBy ?? previous.paid_by_user_id ?? actorId,
  };
};

const accountNameOf = async (accountId: number | null, transaction: Transaction): Promise<string | null> => {
  if (accountId === null) return null;
  const account = await DataBase.instance.variable_general.findOne({ where: { id: accountId }, transaction });
  return account?.name ?? null;
};

// Foto (solo de lo que cambió) para el historial; con la cuenta, su nombre
// de ese momento.
const buildValues = async (
  snapshot: ExpenseSnapshot,
  changed: CorrectableExpenseField[],
  transaction: Transaction
): Promise<MoneyCorrectionValues> => {
  const values: MoneyCorrectionValues = pickFields(snapshot, changed);
  const withWorker = changed.includes("paid_by_user_id")
    ? { ...values, paid_by_user_name: await userDisplayName(snapshot.paid_by_user_id, transaction) }
    : values;
  if (!changed.includes("payment_account_id")) return withWorker;
  const accountId = typeof snapshot.payment_account_id === "number" ? snapshot.payment_account_id : null;
  return { ...withWorker, payment_account_name: await accountNameOf(accountId, transaction) };
};

// Bloquea el gasto y valida que sea un gasto manual vigente dentro del
// alcance de escritura. Compartido con la anulación.
export const lockManualExpense = async (expenseId: number, scope: WriteScope, transaction: Transaction) => {
  const expense = await DataBase.instance.quotation_expense.findOne({
    where: { id: expenseId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!expense) throw new AppError(404, "El gasto no existe");

  const quotation = await DataBase.instance.quotation.findOne({
    where: { id: expense.quotation_id },
    attributes: ["id", "company_id", "business_unit_id"],
    transaction,
  });
  if (!quotation || isOutOfWriteScope(quotation, scope)) throw new AppError(404, "El gasto no existe");

  // El gasto de una compra se mueve junto con la compra (cantidad, deuda con
  // el trabajador, estado del item): corregirlo suelto descuadraría todo.
  const purchase = await DataBase.instance.purchase_order_item_purchase.findOne({
    where: { quotation_expense_id: expenseId },
    attributes: ["id"],
    transaction,
  });
  if (purchase) {
    throw new AppError(
      409,
      "Este gasto es una compra de una orden de compra: corrígelo o anúlalo como compra",
      { purchase_id: purchase.id },
      "EXPENSE_BELONGS_TO_PURCHASE"
    );
  }

  return { expense, quotation };
};

/**
 * Corrige un gasto MANUAL de una cotización ("editar en el lugar + historial
 * inmutable"). Caja, Estadísticas y el margen se calculan en vivo desde
 * quotation_expense: corregir la fila basta para que el monto viejo deje de
 * sumar y el nuevo sume una sola vez, en la cuenta y fecha corregidas.
 *
 * Se permite en cualquier estado de la cotización (corregir un error no
 * registra dinero nuevo). Todo en UNA transacción con el gasto bloqueado:
 * cambio + historial (money_correction) + evento de la cotización + log.
 */
export async function correctQuotationExpense({
  expenseId,
  input,
  scope,
  updatedBy,
}: {
  expenseId: number;
  input: CorrectQuotationExpenseInput;
  scope: WriteScope;
  updatedBy: number;
}): Promise<CorrectQuotationExpenseResult> {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const { expense, quotation } = await lockManualExpense(expenseId, scope, transaction);
    if (expense.is_deleted) {
      throw new AppError(409, "Este gasto está anulado: restáuralo antes de corregirlo", undefined, "EXPENSE_ANNULLED");
    }

    const debt = await lockExpenseDebt(expenseId, transaction);
    const previous = snapshotOf(expense, debt);
    const next = requestedSnapshot(previous, input, updatedBy);
    const changed = changedFieldsBetween(CORRECTABLE_EXPENSE_FIELDS, previous, next);
    assertHasChanges(changed);

    const paidByEmployee = next.funding_source === "employee";
    if (paidByEmployee && changed.includes("paid_by_user_id")) {
      await assertEmployeeAvailable(next.paid_by_user_id, quotation.company_id, transaction);
    }
    await assertExpenseDebtAllowsChange(debt, previous, next, transaction);

    // Cuenta nueva: de la empresa de la cotización y activa. Conservar la
    // misma no se revalida (puede haberse deshabilitado después).
    if (changed.includes("payment_account_id") && next.payment_account_id !== null) {
      await resolvePaymentAccountId({
        accountId: next.payment_account_id,
        companyId: quotation.company_id,
        required: false,
        transaction,
      });
    }

    // Cierre de caja (fase 2): la fecha nueva nunca cae en un mes cerrado
    // (409). Un gasto de un mes cerrado se corrige en el lugar (margen y
    // "Gastado" quedan bien) y la diferencia en caja va como ajuste.
    const change = await beginCashChange({
      companyId: quotation.company_id,
      source: "quotation_expense",
      sourceId: expenseId,
      oldDate: String(previous.spent_at),
      newDate: String(next.spent_at),
      movesCashAfter: !paidByEmployee,
      scope,
      actorId: updatedBy,
      transaction,
    });

    // Nunca se tocan created_*; updated_* siempre.
    await DataBase.instance.quotation_expense.update(
      {
        ...pickTyped(next, changed.filter((field) => field !== "paid_by_user_id")),
        updated_by: updatedBy,
        updated_at: nowUtc(),
      },
      { where: { id: expenseId }, transaction }
    );

    // Monto, fecha y quién pagó se mueven junto con su deuda.
    const debtId = await syncExpenseDebt({
      expenseId,
      companyId: quotation.company_id,
      debt,
      target: next,
      actorId: updatedBy,
      transaction,
    });
    if (debtId !== null) await recalculateDebtsState([debtId], transaction, updatedBy);

    let correctionId = 0;
    const cash = await change.complete(async (kind) => {
      const correction = await recordMoneyCorrection({
        sourceType: "quotation_expense",
        sourceId: expenseId,
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

    const reason = input.reason.trim();
    const amountNote =
      previous.amount === next.amount
        ? formatSoles(Number(next.amount))
        : `${formatSoles(Number(previous.amount))} → ${formatSoles(Number(next.amount))}`;
    await logQuotationEvent({
      quotationId: expense.quotation_id,
      action: "expense_updated",
      description: `Gasto corregido: "${truncateForTimeline(String(next.description))}" (${amountNote})${note}. Motivo: ${truncateForTimeline(reason)}`,
      actorId: updatedBy,
      transaction,
    });
    await createLogService(
      {
        user_id: updatedBy,
        action: LogAction.UPDATE,
        module: "quotation",
        description: `Corrigió el gasto #${expenseId} de la cotización #${expense.quotation_id} (${amountNote}; campos: ${changed.join(", ")})${note}. Motivo: ${reason}`,
        company_id: quotation.company_id,
      },
      transaction
    );

    return {
      id: expenseId,
      correction_id: correctionId,
      changed_fields: changed,
      kind: cash.kind,
      adjusted_period: cash.adjustedPeriod,
    };
  });
}

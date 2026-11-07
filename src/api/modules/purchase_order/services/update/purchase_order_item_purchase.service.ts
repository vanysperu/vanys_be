import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { beginCashChange } from "../../../../../core/money/cashPeriod";
import { cashChangeNote } from "../../../cash_movement/services/update/cash_change_note";
import { WriteScope } from "../../../../../core/rbac/writeScope";
import { formatSoles, toCents } from "../../../../../core/utils/money";
import { nowUtc, toDateOnlyString } from "../../../../../utils/dateUtils";
import { recalculateDebtsState } from "../../../employee_debt/services/shared/debt_state.service";
import { assertEmployeeAvailable, debtBelowReimbursedError } from "../../../employee_debt/services/shared/funded_debt";
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
import { logQuotationEvent, truncateForTimeline } from "../../../quotation/services/timeline/quotation_event.service";
import { resolvePaymentAccountId } from "../../../variable_general/services/shared/payment_account.service";
import { EmployeeDebtModel } from "../../../employee_debt/model/employee_debt.model";
import {
  applyPurchaseInvoiceChange,
  findInvoiceIdOfPurchase,
  invoiceStatusTexts,
  PurchaseInvoiceChange,
  resolvePurchaseInvoiceChange,
} from "../../../invoice/services/shared/purchase_invoice_link";
import { FundingSource } from "../../model/purchase_order_item_purchase.model";
import { buildPurchaseExpenseDescription, purchaseNotesSuffix } from "../shared/purchase_expense_description";
import {
  debtReimbursedError,
  liveDebtOf,
  LockedPurchase,
  lockPurchaseForWrite,
  purchaseAnnulledError,
  userDisplayName,
} from "../shared/purchase_lock.service";
import {
  recalculateItemStatus,
  recalculatePurchaseOrderStatus,
  sumPurchasedQuantity,
} from "../shared/purchase_order_status.service";

// Campos corregibles de una compra. NO: el item ni la cotización (una compra
// de otro producto es otra compra: se anula y se registra la correcta).
export const CORRECTABLE_PURCHASE_FIELDS = [
  "amount",
  "quantity",
  "funding_source",
  "paid_by_user_id",
  "payment_account_id",
  "operation_number",
  "spent_at",
] as const;

export type CorrectablePurchaseField = (typeof CORRECTABLE_PURCHASE_FIELDS)[number];

// Tipo alias (no interface): encaja en CorrectionSnapshot de correction_diff.
type PurchaseSnapshot = {
  amount: number;
  quantity: number;
  funding_source: FundingSource;
  paid_by_user_id: number | null;
  payment_account_id: number | null;
  operation_number: string | null;
  spent_at: string;
};

// `undefined` = se queda como está. `payment_account_id: null` = efectivo.
export interface CorrectPurchaseInput {
  amount?: number | string;
  quantity?: number | string;
  funding_source?: FundingSource;
  paid_by_user_id?: number | string | null;
  payment_account_id?: number | string | null;
  operation_number?: string | null;
  spent_at?: string;
  // true = ya se confirmó subir la cantidad por encima de lo que falta.
  allow_exceed?: boolean;
  // ¿Llevaba factura? undefined = no se toca. Con true e invoice_id, la compra
  // pasa a esa factura ya registrada; sin invoice_id, se crea una si no tenía.
  has_invoice?: boolean;
  invoice_id?: number | null;
  reason: string;
}

export interface CorrectPurchaseResult {
  id: number;
  quotation_expense_id: number;
  correction_id: number;
  changed_fields: CorrectablePurchaseField[];
  // Factura con la que quedó la compra, y si se acaba de crear (para subirle
  // el archivo).
  invoice_id: number | null;
  invoice_created: boolean;
  // 'adjustment' = la compra tocaba caja de un mes cerrado (cierre de caja).
  kind: MoneyCorrectionKind;
  adjusted_period: string | null;
}

const snapshotOf = ({ purchase, expense }: LockedPurchase): PurchaseSnapshot => ({
  amount: toMoneyValue(purchase.amount),
  quantity: Number(purchase.quantity),
  funding_source: purchase.funding_source,
  paid_by_user_id: toNullableId(purchase.paid_by_user_id),
  payment_account_id: toNullableId(expense.payment_account_id),
  operation_number: toNullableText(expense.operation_number),
  spent_at: toDateOnlyString(expense.spent_at),
});

/**
 * Foto pedida, con las reglas de quién puso la plata:
 *   - plata de un trabajador: sin cuenta de la empresa (mandar una → 400
 *     PAYMENT_ACCOUNT_NOT_ALLOWED); el trabajador es el pedido, el de antes
 *     si ya era de un trabajador o, al pasar desde "empresa" sin indicarlo,
 *     quien corrige (mismo criterio que al registrar la compra).
 *   - plata de la empresa: sin trabajador; la cuenta es la pedida o la de
 *     antes (efectivo si antes era de un trabajador).
 * El n.° de operación es solo de plata de la empresa: pasar a plata de un
 * trabajador lo quita (el número irá en su reposición).
 */
const requestedSnapshot = (previous: PurchaseSnapshot, input: CorrectPurchaseInput, actorId: number): PurchaseSnapshot => {
  const base = applyRequested(previous, {
    amount: input.amount === undefined ? undefined : toMoneyValue(input.amount),
    quantity: input.quantity === undefined ? undefined : Number(input.quantity),
    funding_source: input.funding_source,
    spent_at: input.spent_at,
  });
  const requestedAccount = input.payment_account_id === undefined ? undefined : toNullableId(input.payment_account_id);
  const requestedPaidBy = input.paid_by_user_id === undefined ? undefined : toNullableId(input.paid_by_user_id);
  const requestedOperation = input.operation_number === undefined ? undefined : toNullableText(input.operation_number);

  if (base.funding_source === "employee") {
    if (requestedOperation !== undefined && requestedOperation !== null) {
      throw new AppError(
        400,
        "Una compra pagada con plata del trabajador no lleva número de operación: va en su reposición",
        undefined,
        "OPERATION_NUMBER_NOT_ALLOWED"
      );
    }
    if (requestedAccount !== undefined && requestedAccount !== null) {
      throw new AppError(
        400,
        "Una compra pagada con plata del trabajador no sale de una cuenta de la empresa",
        undefined,
        "PAYMENT_ACCOUNT_NOT_ALLOWED"
      );
    }
    const fallbackPaidBy = previous.funding_source === "employee" ? previous.paid_by_user_id : actorId;
    return { ...base, payment_account_id: null, operation_number: null, paid_by_user_id: requestedPaidBy ?? fallbackPaidBy };
  }

  if (requestedPaidBy !== undefined && requestedPaidBy !== null) {
    throw new AppError(400, "Una compra pagada por la empresa no lleva trabajador que la pagó", undefined, "PAID_BY_NOT_ALLOWED");
  }
  const fallbackAccount = previous.funding_source === "company" ? previous.payment_account_id : null;
  // `null` explícito = efectivo; solo `undefined` significa "no se mandó".
  const nextAccount = requestedAccount === undefined ? fallbackAccount : requestedAccount;
  const nextOperation = requestedOperation === undefined ? previous.operation_number : requestedOperation;
  return { ...base, paid_by_user_id: null, payment_account_id: nextAccount, operation_number: nextOperation };
};

const accountNameOf = async (accountId: number | null, transaction: Transaction): Promise<string | null> => {
  if (accountId === null) return null;
  const account = await DataBase.instance.variable_general.findOne({ where: { id: accountId }, transaction });
  return account?.name ?? null;
};

const asNullableNumber = (value: string | number | null | undefined): number | null =>
  typeof value === "number" ? value : null;

interface DebtSnapshot {
  debt_amount: number | null;
  debt_status: string | null;
}

const debtSnapshotOf = (debt: EmployeeDebtModel | null): DebtSnapshot => ({
  debt_amount: debt ? toMoneyValue(debt.amount) : null,
  debt_status: debt?.status ?? null,
});

// Foto para el historial: lo que cambió + nombres del momento (cuenta,
// trabajador) + la deuda antes/después si cambió + la factura si cambió.
const buildValues = async (
  snapshot: PurchaseSnapshot,
  changed: CorrectablePurchaseField[],
  debt: DebtSnapshot,
  includeDebt: boolean,
  invoiceStatus: string | null,
  transaction: Transaction
): Promise<MoneyCorrectionValues> => {
  const values: MoneyCorrectionValues = pickFields(snapshot, changed);
  const withAccount = changed.includes("payment_account_id")
    ? { ...values, payment_account_name: await accountNameOf(asNullableNumber(snapshot.payment_account_id), transaction) }
    : values;
  const withPaidBy = changed.includes("paid_by_user_id")
    ? { ...withAccount, paid_by_user_name: await userDisplayName(asNullableNumber(snapshot.paid_by_user_id), transaction) }
    : withAccount;
  const withDebt = includeDebt ? { ...withPaidBy, ...debt } : withPaidBy;
  return invoiceStatus === null ? withDebt : { ...withDebt, invoice_status: invoiceStatus };
};

// Subir la cantidad por encima de lo que falta exige confirmación explícita
// (mismo 409 PURCHASE_EXCEEDS_REMAINING que al registrar). Bajarla nunca se
// bloquea. Devuelve cuánto queda por encima de lo pedido (para el gasto).
const resolveExtraQuantity = async (
  locked: LockedPurchase,
  previous: PurchaseSnapshot,
  next: PurchaseSnapshot,
  allowExceed: boolean,
  transaction: Transaction
): Promise<number> => {
  const otherPurchased = await sumPurchasedQuantity(locked.item.id, transaction, locked.purchase.id);
  const remaining = Math.max(locked.item.quantity - otherPurchased, 0);
  const extra = Math.max(next.quantity - remaining, 0);
  if (extra === 0 || next.quantity <= previous.quantity || allowExceed) return extra;

  throw new AppError(
    409,
    remaining > 0
      ? `La cantidad a comprar era ${locked.item.quantity} y las otras compras ya suman ${otherPurchased}: esta compra puede ser de hasta ${remaining}.`
      : `La cantidad a comprar era ${locked.item.quantity} y las otras compras ya la completan.`,
    { ordered: locked.item.quantity, already_purchased: otherPurchased, requested: next.quantity },
    "PURCHASE_EXCEEDS_REMAINING"
  );
};

// Reglas de la deuda con el trabajador cuando ya se le repuso algo: no se le
// puede quitar (pasar a plata de la empresa / cambiar de trabajador) ni bajar
// el monto por debajo de lo repuesto. Lo repuesto se lee con la deuda ya
// bloqueada.
const assertDebtRules = async (
  locked: LockedPurchase,
  previous: PurchaseSnapshot,
  next: PurchaseSnapshot,
  transaction: Transaction
) => {
  const liveDebt = liveDebtOf(locked.debt);
  const paidCents = liveDebt ? toCents(liveDebt.paid_amount) : 0;
  if (!liveDebt || paidCents === 0) return;
  if (next.funding_source === "company") throw await debtReimbursedError(liveDebt, transaction);
  if (next.paid_by_user_id !== previous.paid_by_user_id) throw await debtReimbursedError(liveDebt, transaction);
  if (toCents(next.amount) < paidCents) throw debtBelowReimbursedError(liveDebt);
};

/**
 * Deja la deuda de la compra cumpliendo el invariante: compra con plata de un
 * trabajador → exactamente UNA deuda vigente con amount = monto de la compra,
 * user_id = quien pagó, incurred_at = fecha del gasto; con plata de la
 * empresa → ninguna vigente. Escribe directo en employee_debt (dentro de la
 * transacción de la compra) y devuelve la deuda tocada, para recalcular su
 * estado. El orden de las escrituras respeta los CHECK de la base (amount > 0
 * y paid_amount <= amount): el monto nunca baja de lo repuesto (validado).
 */
const syncPurchaseDebt = async (
  locked: LockedPurchase,
  next: PurchaseSnapshot,
  updatedBy: number,
  transaction: Transaction
): Promise<number | null> => {
  const audit = { updated_by: updatedBy, updated_at: nowUtc() };
  const liveDebt = liveDebtOf(locked.debt);

  if (next.funding_source === "company") {
    if (!liveDebt) return null;
    // Sin nada repuesto (validado): se anula, no queda debiéndole nada.
    await DataBase.instance.employee_debt.update({ status: "cancelled", ...audit }, { where: { id: liveDebt.id }, transaction });
    return liveDebt.id;
  }

  const userId = next.paid_by_user_id;
  if (userId === null) throw new AppError(400, "Indica qué trabajador puso el dinero", undefined, "EMPLOYEE_NOT_AVAILABLE");
  const fields = { user_id: userId, amount: next.amount, incurred_at: next.spent_at, ...audit };

  if (liveDebt) {
    await DataBase.instance.employee_debt.update(fields, { where: { id: liveDebt.id }, transaction });
    return liveDebt.id;
  }

  // purchase_order_item_purchase_id es UNIQUE: si la compra ya tuvo una deuda
  // (anulada al pasarla a plata de la empresa), se reactiva esa misma fila.
  if (locked.debt) {
    await DataBase.instance.employee_debt.update(
      { ...fields, status: "pending", paid_amount: 0 },
      { where: { id: locked.debt.id }, transaction }
    );
    return locked.debt.id;
  }

  const created = await DataBase.instance.employee_debt.create(
    {
      id: 0,
      company_id: locked.purchaseOrder.company_id,
      user_id: userId,
      origin: "purchase",
      purchase_order_item_purchase_id: locked.purchase.id,
      quotation_expense_id: null,
      description: null,
      category: null,
      // La tienda de una deuda de compra la da la cotización de la orden.
      business_unit_id: null,
      incurred_at: next.spent_at,
      amount: next.amount,
      paid_amount: 0,
      status: "pending",
      paid_at: null,
      payment_account_id: null,
      created_by: updatedBy,
      created_at: audit.updated_at,
      updated_by: updatedBy,
      updated_at: audit.updated_at,
    },
    { transaction }
  );
  return created.id;
};

/**
 * Corrige una compra de orden de compra ("editar en el lugar + historial
 * inmutable"). El monto vive copiado en tres lugares — compra, su gasto y
 * (con plata de un trabajador) su deuda — y se corrige en los tres juntos;
 * la cantidad recalcula el estado del item y de la orden; quién puso la plata
 * crea, reactiva, reasigna o anula la deuda. Caja y Estadísticas se calculan
 * en vivo desde el gasto: corregirlo basta para que cuadren.
 *
 * Todo en UNA transacción, con todo bloqueado en el orden item → orden →
 * compra → gasto → deuda; el historial se guarda con la fuente
 * "quotation_expense" y el id del gasto (la fila que muestra Caja).
 *
 * También se corrige si llevaba factura (pedido explícito del usuario). Eso no
 * mueve dinero: cambiar SOLO la factura de una compra de un mes cerrado no
 * deja ajuste, porque antes y después el efecto en caja es el mismo.
 */
export async function correctPurchase({
  purchaseId,
  input,
  scope,
  updatedBy,
}: {
  purchaseId: number;
  input: CorrectPurchaseInput;
  scope: WriteScope;
  updatedBy: number;
}): Promise<CorrectPurchaseResult> {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const locked = await lockPurchaseForWrite(purchaseId, scope, transaction);
    const { item, purchaseOrder, purchase, expense } = locked;
    if (purchase.is_deleted) throw purchaseAnnulledError();

    const previous = snapshotOf(locked);
    const next = requestedSnapshot(previous, input, updatedBy);
    const changed = changedFieldsBetween(CORRECTABLE_PURCHASE_FIELDS, previous, next);
    const currentInvoiceId = await findInvoiceIdOfPurchase(purchaseId, transaction);
    const invoiceChange: PurchaseInvoiceChange = resolvePurchaseInvoiceChange(
      { hasInvoice: input.has_invoice, invoiceId: input.invoice_id },
      currentInvoiceId
    );
    // Cambiar solo la factura también es una corrección.
    if (invoiceChange.kind === "none") assertHasChanges(changed);

    const extraQuantity = await resolveExtraQuantity(locked, previous, next, input.allow_exceed === true, transaction);
    if (changed.includes("payment_account_id") && next.payment_account_id !== null) {
      await resolvePaymentAccountId({
        accountId: next.payment_account_id,
        companyId: purchaseOrder.company_id,
        required: false,
        transaction,
      });
    }
    const workerChanged = changed.includes("paid_by_user_id") || changed.includes("funding_source");
    if (next.funding_source === "employee" && workerChanged) {
      await assertEmployeeAvailable(next.paid_by_user_id, purchaseOrder.company_id, transaction);
    }
    await assertDebtRules(locked, previous, next, transaction);

    // Cierre de caja (fase 2): la fecha nueva nunca cae en un mes cerrado
    // (409). Con plata del trabajador la compra no mueve caja (su egreso es
    // la reposición): cambiar el monto de una compra del trabajador no deja
    // patas; pasar de trabajador a empresa (o al revés) en un mes cerrado sí,
    // como ajuste. El historial se guarda con el id del gasto (fila de Caja).
    const change = await beginCashChange({
      companyId: purchaseOrder.company_id,
      source: "quotation_expense",
      sourceId: expense.id,
      oldDate: previous.spent_at,
      newDate: next.spent_at,
      movesCashAfter: next.funding_source === "company",
      scope,
      actorId: updatedBy,
      transaction,
    });

    const audit = { updated_by: updatedBy, updated_at: nowUtc() };
    await DataBase.instance.purchase_order_item_purchase.update(
      {
        amount: next.amount,
        quantity: next.quantity,
        funding_source: next.funding_source,
        paid_by_user_id: next.paid_by_user_id,
        ...audit,
      },
      { where: { id: purchaseId }, transaction }
    );
    // La descripción del gasto lleva la cantidad: se rehace solo si cambió,
    // conservando las notas escritas al registrar la compra.
    const description = changed.includes("quantity")
      ? buildPurchaseExpenseDescription(locked.productName, next.quantity, extraQuantity, purchaseNotesSuffix(expense.description, locked.productName))
      : expense.description;
    await DataBase.instance.quotation_expense.update(
      { amount: next.amount, spent_at: next.spent_at, payment_account_id: next.payment_account_id, operation_number: next.operation_number, description, ...audit },
      { where: { id: expense.id }, transaction }
    );

    const debtBefore = debtSnapshotOf(liveDebtOf(locked.debt));
    const debtId = await syncPurchaseDebt(locked, next, updatedBy, transaction);
    if (debtId !== null) await recalculateDebtsState([debtId], transaction, updatedBy);
    const debtAfterRow =
      debtId === null ? null : await DataBase.instance.employee_debt.findOne({ where: { id: debtId }, transaction });
    const debtAfter = debtSnapshotOf(liveDebtOf(debtAfterRow));
    const debtChanged = debtBefore.debt_amount !== debtAfter.debt_amount || debtBefore.debt_status !== debtAfter.debt_status;

    if (changed.includes("quantity")) {
      await recalculateItemStatus(item.id, transaction, updatedBy);
      await recalculatePurchaseOrderStatus(purchaseOrder.id, transaction, updatedBy);
    }

    const invoiceId = await applyPurchaseInvoiceChange({
      change: invoiceChange,
      currentInvoiceId,
      purchaseId,
      companyId: Number(purchaseOrder.company_id),
      businessUnitId: locked.businessUnitId === null ? null : Number(locked.businessUnitId),
      quotationId: Number(purchaseOrder.quotation_id),
      description: `${locked.productName} × ${next.quantity}`,
      actorId: updatedBy,
      transaction,
    });
    const invoiceTexts = invoiceChange.kind === "none" ? null : invoiceStatusTexts(invoiceChange, currentInvoiceId);

    let correctionId = 0;
    const cash = await change.complete(async (kind) => {
      const correction = await recordMoneyCorrection({
        sourceType: "quotation_expense",
        sourceId: expense.id,
        companyId: purchaseOrder.company_id,
        businessUnitId: locked.businessUnitId,
        previous: await buildValues(previous, changed, debtBefore, debtChanged, invoiceTexts?.before ?? null, transaction),
        next: await buildValues(next, changed, debtAfter, debtChanged, invoiceTexts?.after ?? null, transaction),
        reason: input.reason,
        actorId: updatedBy,
        kind,
        transaction,
      });
      correctionId = correction.id;
      return correction.id;
    });
    const invoiceNote = invoiceTexts ? `; factura: ${invoiceTexts.before} → ${invoiceTexts.after}` : "";
    const note = `${cashChangeNote(cash)}${invoiceNote}`;

    const reason = input.reason.trim();
    const amountNote =
      previous.amount === next.amount
        ? formatSoles(next.amount)
        : `${formatSoles(previous.amount)} → ${formatSoles(next.amount)}`;
    await logQuotationEvent({
      quotationId: purchaseOrder.quotation_id,
      action: "purchase_updated",
      description: `Compra corregida: ${locked.productName} x${next.quantity} (${amountNote})${note}. Motivo: ${truncateForTimeline(reason)}`,
      actorId: updatedBy,
      transaction,
    });
    await createLogService(
      {
        user_id: updatedBy,
        action: LogAction.UPDATE,
        module: "purchase_order",
        description: `Corrigió la compra #${purchaseId} (gasto #${expense.id}) de la orden #${purchaseOrder.id} (${amountNote}; campos: ${changed.join(", ")})${note}. Motivo: ${reason}`,
        company_id: purchaseOrder.company_id,
      },
      transaction
    );

    return {
      id: purchaseId,
      quotation_expense_id: expense.id,
      correction_id: correctionId,
      changed_fields: changed,
      invoice_id: invoiceId,
      invoice_created: invoiceChange.kind === "create",
      kind: cash.kind,
      adjusted_period: cash.adjustedPeriod,
    };
  });
}

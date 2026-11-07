import { QueryTypes, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { fromCents, toCents } from "../../../../../core/utils/money";
import { formatPeriodEs, periodOf } from "../../../../../utils/dateUtils";
import { isClosedDate, loadPeriodMap } from "../../../cash_closing/services/shared/period_state.service";
import { QuotationResetSummary, ResetMoneyLine } from "../../types/reset.types";

// Lo que se quita de una reposición a un trabajador. Si solo cubría deudas de
// esta cotización se borra; si cubría otras, se conserva sin esta parte.
export interface ResetReimbursement {
  id: number;
  removedCents: number;
  deletesPayment: boolean;
}

export interface QuotationResetPlan {
  quotationId: number;
  companyId: number;
  status: string;
  orderIds: number[];
  orderItemIds: number[];
  purchaseIds: number[];
  paymentIds: number[];
  expenseIds: number[];
  cashMovementIds: number[];
  debtIds: number[];
  reimbursements: ResetReimbursement[];
  issuedInvoiceIds: number[];
  purchaseInvoiceIds: number[];
  correctionIds: number[];
  summary: QuotationResetSummary;
  // Meses cerrados que impiden resetear (YYYY-MM).
  blockedPeriods: string[];
}

interface IdRow {
  id: number | string;
}

interface QuotationRow extends IdRow {
  company_id: number | string;
  status: string;
  is_deleted: number | boolean;
}

interface MoneyRow extends IdRow {
  amount: number | string;
  money_date: string;
  is_deleted: number | boolean;
}

interface ExpenseRow extends MoneyRow {
  purchase_id: number | string | null;
  funding_source: string | null;
}

interface DebtRow extends IdRow {
  amount: number | string;
  status: string;
}

interface AllocationRow {
  payment_id: number | string;
  amount: number | string;
  paid_at: string;
  is_deleted: number | boolean;
}

interface LegRow {
  money_correction_id: number | string;
  entry_date: string;
}

// MySQL no acepta "IN ()": una lista vacía se reemplaza por un id imposible.
const orNone = (ids: readonly number[]): readonly number[] => (ids.length > 0 ? ids : [0]);
const idsOf = (rows: readonly IdRow[]): number[] => [...new Set(rows.map((row) => Number(row.id)))];
const isLive = (row: { is_deleted: number | boolean }): boolean => !row.is_deleted;

const moneyLine = (amounts: readonly (number | string)[]): ResetMoneyLine => ({
  count: amounts.length,
  total: fromCents(amounts.reduce<number>((sum, amount) => sum + toCents(amount), 0)),
});

// Facturas emitidas de la cotización y facturas de compra que tocan sus compras
// (las que además cubren compras vigentes de otra cotización se conservan).
const loadInvoices = async (quotationId: number, purchaseIds: readonly number[], transaction?: Transaction) => {
  const select = <T extends object>(sql: string, replacements: Record<string, unknown>) =>
    DataBase.instance.sequelize.query<T>(sql, { type: QueryTypes.SELECT, replacements, transaction });

  const issued = await select<IdRow>("SELECT id FROM invoice WHERE quotation_id = :quotationId AND type = 'issued'", { quotationId });
  const linked = await select<IdRow>(
    `SELECT DISTINCT i.id FROM invoice i
     LEFT JOIN invoice_purchase ip ON ip.invoice_id = i.id
     WHERE i.type = 'purchase' AND (i.quotation_id = :quotationId OR ip.purchase_id IN (:purchaseIds))`,
    { quotationId, purchaseIds: orNone(purchaseIds) }
  );
  const purchaseInvoiceIds = idsOf(linked);
  const kept = await select<IdRow>(
    `SELECT DISTINCT ip.invoice_id AS id FROM invoice_purchase ip
     INNER JOIN purchase_order_item_purchase pop ON pop.id = ip.purchase_id
     WHERE ip.invoice_id IN (:invoiceIds) AND ip.purchase_id NOT IN (:purchaseIds) AND pop.is_deleted = false`,
    { invoiceIds: orNone(purchaseInvoiceIds), purchaseIds: orNone(purchaseIds) }
  );
  return { issuedInvoiceIds: idsOf(issued), purchaseInvoiceIds, keptCount: kept.length };
};

/**
 * Todo lo que generó una cotización y lo que pasaría al resetearla. La usan la
 * vista previa (sin transacción: solo lee) y el reset (con transacción: bloquea
 * las filas, en el mismo orden que corregir o anular una compra — item → orden
 * → compra → gasto → deuda —, y el libro de caja al final, igual que
 * beginCashChange). Así lo que se muestra y lo que se borra salen del mismo
 * cálculo.
 */
export async function loadResetPlan(quotationId: number, transaction?: Transaction): Promise<QuotationResetPlan> {
  const forUpdate = transaction ? " FOR UPDATE" : "";
  const select = <T extends object>(sql: string, replacements: Record<string, unknown>) =>
    DataBase.instance.sequelize.query<T>(sql, { type: QueryTypes.SELECT, replacements, transaction });

  const [quotation] = await select<QuotationRow>(
    `SELECT id, company_id, status, is_deleted FROM quotation WHERE id = :quotationId${forUpdate}`,
    { quotationId }
  );
  if (!quotation || quotation.is_deleted) throw new AppError(404, "La cotización no existe");
  const companyId = Number(quotation.company_id);

  const orders = await select<IdRow>("SELECT id FROM purchase_order WHERE quotation_id = :quotationId", { quotationId });
  const orderIds = idsOf(orders);
  const orderItems = await select<IdRow>(`SELECT id FROM purchase_order_item WHERE purchase_order_id IN (:orderIds)${forUpdate}`, {
    orderIds: orNone(orderIds),
  });
  const orderItemIds = idsOf(orderItems);
  await select<IdRow>(`SELECT id FROM purchase_order WHERE id IN (:orderIds)${forUpdate}`, { orderIds: orNone(orderIds) });
  const purchases = await select<IdRow>(
    `SELECT id FROM purchase_order_item_purchase WHERE purchase_order_item_id IN (:orderItemIds)${forUpdate}`,
    { orderItemIds: orNone(orderItemIds) }
  );
  const purchaseIds = idsOf(purchases);

  const expenses = await select<ExpenseRow>(
    `SELECT qe.id, qe.amount, DATE_FORMAT(qe.spent_at, '%Y-%m-%d') AS money_date, qe.is_deleted,
            pop.id AS purchase_id, pop.funding_source
     FROM quotation_expense qe
     LEFT JOIN purchase_order_item_purchase pop ON pop.quotation_expense_id = qe.id
     WHERE qe.quotation_id = :quotationId${forUpdate}`,
    { quotationId }
  );
  const debts = await select<DebtRow>(
    `SELECT id, amount, status FROM employee_debt WHERE purchase_order_item_purchase_id IN (:purchaseIds)${forUpdate}`,
    { purchaseIds: orNone(purchaseIds) }
  );
  const debtIds = idsOf(debts);
  const payments = await select<MoneyRow>(
    `SELECT id, amount, DATE_FORMAT(paid_at, '%Y-%m-%d') AS money_date, is_deleted
     FROM quotation_payment WHERE quotation_id = :quotationId${forUpdate}`,
    { quotationId }
  );
  const cashMovements = await select<MoneyRow>(
    `SELECT id, amount, DATE_FORMAT(occurred_at, '%Y-%m-%d') AS money_date, is_deleted
     FROM cash_movement WHERE quotation_id = :quotationId OR purchase_order_id IN (:orderIds)${forUpdate}`,
    { quotationId, orderIds: orNone(orderIds) }
  );

  // Reposiciones de esas deudas. Una que cubría también otras deudas no se
  // borra: solo pierde esta parte, y las otras deudas siguen pagadas.
  const allocations = await select<AllocationRow>(
    `SELECT a.employee_debt_payment_id AS payment_id, a.amount, DATE_FORMAT(p.paid_at, '%Y-%m-%d') AS paid_at, p.is_deleted
     FROM employee_debt_payment_allocation a
     INNER JOIN employee_debt_payment p ON p.id = a.employee_debt_payment_id
     WHERE a.employee_debt_id IN (:debtIds)${forUpdate}`,
    { debtIds: orNone(debtIds) }
  );
  const touchedPaymentIds = [...new Set(allocations.map((row) => Number(row.payment_id)))];
  const shared = await select<{ payment_id: number | string }>(
    `SELECT DISTINCT employee_debt_payment_id AS payment_id FROM employee_debt_payment_allocation
     WHERE employee_debt_payment_id IN (:paymentIds) AND employee_debt_id NOT IN (:debtIds)`,
    { paymentIds: orNone(touchedPaymentIds), debtIds: orNone(debtIds) }
  );
  const sharedPaymentIds = new Set(shared.map((row) => Number(row.payment_id)));
  const reimbursements = touchedPaymentIds.map((id) => ({
    id,
    removedCents: allocations
      .filter((row) => Number(row.payment_id) === id)
      .reduce((sum, row) => sum + toCents(row.amount), 0),
    deletesPayment: !sharedPaymentIds.has(id),
  }));

  const paymentIds = idsOf(payments);
  const expenseIds = idsOf(expenses);
  const cashMovementIds = idsOf(cashMovements);
  const deletedReimbursementIds = reimbursements.filter((row) => row.deletesPayment).map((row) => row.id);

  // Correcciones de todo lo que se borra y las patas de ajuste de cierre que
  // las acompañan.
  const sourceMatch = `(source_type = 'quotation_payment' AND source_id IN (:paymentIds))
    OR (source_type = 'quotation_expense' AND source_id IN (:expenseIds))
    OR (source_type = 'employee_debt' AND source_id IN (:debtIds))
    OR (source_type = 'employee_debt_payment' AND source_id IN (:reimbursementIds))
    OR (source_type = 'manual' AND source_id IN (:cashMovementIds))`;
  const sources = {
    paymentIds: orNone(paymentIds),
    expenseIds: orNone(expenseIds),
    debtIds: orNone(debtIds),
    reimbursementIds: orNone(deletedReimbursementIds),
    cashMovementIds: orNone(cashMovementIds),
  };
  const corrections = await select<IdRow>(`SELECT id FROM money_correction WHERE ${sourceMatch}`, sources);
  const directLegs = await select<LegRow>(
    `SELECT money_correction_id, DATE_FORMAT(entry_date, '%Y-%m-%d') AS entry_date FROM cash_adjustment_entry
     WHERE quotation_id = :quotationId OR purchase_order_id IN (:orderIds) OR ${sourceMatch}`,
    { ...sources, quotationId, orderIds: orNone(orderIds) }
  );
  const correctionIds = [...new Set([...idsOf(corrections), ...directLegs.map((leg) => Number(leg.money_correction_id))])];
  // Las dos patas de cada ajuste: se revisan y se borran juntas.
  const legs = await select<LegRow>(
    `SELECT money_correction_id, DATE_FORMAT(entry_date, '%Y-%m-%d') AS entry_date FROM cash_adjustment_entry
     WHERE money_correction_id IN (:correctionIds)`,
    { correctionIds: orNone(correctionIds) }
  );

  const { issuedInvoiceIds, purchaseInvoiceIds, keptCount } = await loadInvoices(quotationId, purchaseIds, transaction);

  // Fechas con efecto en caja: un mes cerrado queda fijo. Una compra pagada por
  // un trabajador no mueve caja (su egreso es la reposición) y lo anulado ya no
  // suma, salvo por sus patas de ajuste, que también se revisan.
  const cashDates = [
    ...payments.filter(isLive).map((row) => row.money_date),
    ...expenses.filter((row) => isLive(row) && row.funding_source !== "employee").map((row) => row.money_date),
    ...cashMovements.filter(isLive).map((row) => row.money_date),
    ...allocations.filter(isLive).map((row) => row.paid_at),
    ...legs.map((leg) => leg.entry_date),
  ];
  const periodMap = await loadPeriodMap(companyId, transaction, transaction ? "share" : "none");
  const blockedPeriods = [...new Set(cashDates.filter((date) => isClosedDate(periodMap, date)).map(periodOf))].sort();

  const liveExpenses = expenses.filter(isLive);
  const liveAllocations = allocations.filter(isLive);
  const summary: QuotationResetSummary = {
    payments: moneyLine(payments.filter(isLive).map((row) => row.amount)),
    expenses: moneyLine(liveExpenses.filter((row) => row.purchase_id === null).map((row) => row.amount)),
    purchases: moneyLine(liveExpenses.filter((row) => row.purchase_id !== null).map((row) => row.amount)),
    purchase_orders: orderIds.length,
    debts: moneyLine(debts.filter((row) => row.status !== "cancelled").map((row) => row.amount)),
    reimbursements: {
      count: new Set(liveAllocations.map((row) => Number(row.payment_id))).size,
      total: fromCents(liveAllocations.reduce((sum, row) => sum + toCents(row.amount), 0)),
    },
    cash_movements: moneyLine(cashMovements.filter(isLive).map((row) => row.amount)),
    invoices_deleted: issuedInvoiceIds.length + purchaseInvoiceIds.length - keptCount,
    invoices_kept: keptCount,
  };

  return {
    quotationId,
    companyId,
    status: quotation.status,
    orderIds,
    orderItemIds,
    purchaseIds,
    paymentIds,
    expenseIds,
    cashMovementIds,
    debtIds,
    reimbursements,
    issuedInvoiceIds,
    purchaseInvoiceIds,
    correctionIds,
    summary,
    blockedPeriods,
  };
}

const hasSomethingToDelete = (plan: QuotationResetPlan): boolean =>
  [
    plan.orderIds,
    plan.paymentIds,
    plan.expenseIds,
    plan.cashMovementIds,
    plan.issuedInvoiceIds,
    plan.purchaseInvoiceIds,
  ].some((ids) => ids.length > 0);

const periodsText = (periods: readonly string[]): string => periods.map(formatPeriodEs).join(", ");

// Por qué no se puede resetear (null = se puede). Mismo motivo en la vista
// previa y en el reset, que vuelve a revisarlo con las filas bloqueadas.
export const resetBlockOf = (plan: QuotationResetPlan): AppError | null => {
  if (plan.status === "quote_requested") {
    return new AppError(
      409,
      "Este pedido de la web todavía no se cotizó: complétalo en vez de resetearlo.",
      undefined,
      "QUOTATION_RESET_NOT_QUOTED"
    );
  }
  // Un mes cerrado no cambia: borrar uno de sus movimientos descuadraría el
  // cierre y el saldo inicial de los meses siguientes.
  if (plan.blockedPeriods.length > 0) {
    return new AppError(
      409,
      `Tiene movimientos en ${periodsText(plan.blockedPeriods)}, ya cerrado. Reabre ese mes en Cierres de caja, resetea la cotización y vuelve a cerrarlo.`,
      { periods: plan.blockedPeriods },
      "QUOTATION_RESET_CLOSED_PERIOD"
    );
  }
  if (plan.status === "pending" && !hasSomethingToDelete(plan)) {
    return new AppError(409, "La cotización ya está en Pendiente y no tiene nada que borrar.", undefined, "QUOTATION_RESET_NOTHING");
  }
  return null;
};

import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";
import { CashMovementDirection } from "../../model/cash_movement.model";
import { buildPaginationMeta, PaginatedResult } from "../../../../../core/utils/paginate";
import { fromCents, toCents } from "../../../../../core/utils/money";
import {
  EXPENSE_FUNDING_JOIN_SQL,
  EXPENSE_PAID_BY_COMPANY_SQL,
  REIMBURSEMENT_ALLOCATIONS_FROM_SQL,
  REIMBURSEMENT_SCOPE_SQL,
} from "../shared/cash_flow.sql";

// Shape normalizado común a todas las fuentes que se juntan en un solo
// listado (pedido explícito del usuario: "toda entrada y salida de dinero").
// Nunca se duplican: cada fila vive en su propia tabla y acá solo se refleja.
//   - "manual": movimientos de esta tabla (alquiler, aporte de capital…).
//   - "quotation_payment": pagos de clientes.
//   - "quotation_expense": gastos de cotizaciones (toda compra de una orden
//     genera uno).
//   - "employee_debt": gastos que un trabajador pagó con su plata fuera de
//     una orden (deuda manual).
//   - "employee_debt_payment": reposiciones a trabajadores.
//
// Caja = dinero que REALMENTE entra o sale de la empresa. Un gasto pagado con
// plata de un trabajador (compra o deuda manual) se lista para que se sepa
// quién lo pagó, pero con moves_cash=false: no suma, porque la empresa no
// soltó nada. El egreso es la reposición, en su fecha, por su monto y desde
// su cuenta (antes la compra figuraba como egreso el día de la compra y la
// reposición no figuraba en ninguna parte).
export type CashMovementSource =
  | "manual"
  | "quotation_payment"
  | "quotation_expense"
  | "employee_debt"
  | "employee_debt_payment";

export const CASH_MOVEMENT_SOURCES: CashMovementSource[] = [
  "manual",
  "quotation_payment",
  "quotation_expense",
  "employee_debt",
  "employee_debt_payment",
];

export interface CashMovementListItem {
  id: string;
  source: CashMovementSource;
  // Solo los movimientos "manual" se pueden deshabilitar desde este módulo
  // — el resto se gestiona desde su propia pantalla de origen.
  source_id: number;
  direction: CashMovementDirection;
  category: string | null;
  amount: number;
  description: string | null;
  occurred_at: string;
  quotation_id: number | null;
  purchase_order_id: number | null;
  business_unit_id: number | null;
  // false = gasto pagado con plata de un trabajador: informativo, no suma.
  moves_cash: boolean;
  // Cuenta por la que entró/salió el dinero (null = efectivo; en las filas
  // que no mueven caja, siempre null).
  payment_account_id: number | null;
  payment_account_name: string | null;
  // Solo en gastos pagados con plata de un trabajador: quién puso el dinero
  // y cuánto se le repuso ya.
  paid_by_employee_name: string | null;
  reimbursement_status: "pending" | "paid" | null;
  reimbursed_amount: number | null;
  reimbursed_at: string | null;
  // Solo en reposiciones: el monto total de la reposición (si se filtra por
  // tienda o cotización, `amount` es solo la parte que les corresponde).
  reimbursement_total: number | null;
  created_at: string;
}

export interface CashAccountSummary {
  // null = efectivo.
  payment_account_id: number | null;
  payment_account_name: string;
  income: number;
  expense: number;
  net: number;
}

// Totales de TODO lo filtrado (no de la página), solo con lo que mueve caja.
export interface CashMovementSummary {
  income: number;
  expense: number;
  net: number;
  by_account: CashAccountSummary[];
}

export interface CashMovementListResult extends PaginatedResult<CashMovementListItem> {
  summary: CashMovementSummary;
}

export interface CashMovementListFilter {
  // null = is_system (ve todo). La tienda (businessUnitId) sigue el mismo
  // criterio de alcance ya usado en clientes/cotizaciones/usuarios (ver
  // core/rbac/businessUnitScope.ts).
  companyId: number | null;
  businessUnitId?: number;
  direction?: CashMovementDirection;
  category?: string;
  source?: CashMovementSource;
  // Cuenta; "cash" = solo los movimientos en efectivo (sin cuenta).
  paymentAccountId?: number | "cash";
  quotationId?: number;
  purchaseOrderId?: number;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  limit: number;
}

interface RawRow {
  id: number;
  direction: CashMovementDirection;
  category: string | null;
  amount: string;
  description: string | null;
  occurred_at: string;
  quotation_id: number | null;
  purchase_order_id: number | null;
  business_unit_id: number | null;
  moves_cash: number | string;
  payment_account_id: number | null;
  payment_account_name: string | null;
  paid_by_employee_name?: string | null;
  reimbursement_status?: "pending" | "paid" | null;
  reimbursed_amount?: string | null;
  reimbursed_at?: string | null;
  reimbursement_total?: string | null;
  created_at: Date;
}

// Condición de cuenta reutilizada por las consultas. `column` es siempre
// un nombre fijo del código, nunca un valor del usuario (que va bindeado).
const accountCondition = (column: string, filter: CashMovementListFilter): string => {
  if (filter.paymentAccountId === "cash") return `AND ${column} IS NULL`;
  if (typeof filter.paymentAccountId === "number") return `AND ${column} = :paymentAccountId`;
  return "";
};

const baseReplacements = (filter: CashMovementListFilter) => ({
  companyId: filter.companyId,
  businessUnitId: filter.businessUnitId ?? null,
  quotationId: filter.quotationId ?? null,
  purchaseOrderId: filter.purchaseOrderId ?? null,
  category: filter.category ?? null,
  direction: filter.direction ?? null,
  paymentAccountId: typeof filter.paymentAccountId === "number" ? filter.paymentAccountId : null,
  dateFrom: filter.dateFrom ?? null,
  dateTo: filter.dateTo ?? null,
});

const toItem = (source: CashMovementSource, prefix: string, row: RawRow): CashMovementListItem => ({
  id: `${prefix}-${row.id}`,
  source,
  source_id: row.id,
  direction: row.direction,
  category: row.category,
  amount: Number(row.amount),
  description: row.description,
  occurred_at: row.occurred_at,
  quotation_id: row.quotation_id,
  purchase_order_id: row.purchase_order_id,
  business_unit_id: row.business_unit_id,
  moves_cash: Number(row.moves_cash) === 1,
  payment_account_id: row.payment_account_id,
  payment_account_name: row.payment_account_name,
  paid_by_employee_name: row.paid_by_employee_name ?? null,
  reimbursement_status: row.reimbursement_status ?? null,
  reimbursed_amount: row.reimbursed_amount === null || row.reimbursed_amount === undefined ? null : Number(row.reimbursed_amount),
  reimbursed_at: row.reimbursed_at ?? null,
  reimbursement_total:
    row.reimbursement_total === null || row.reimbursement_total === undefined ? null : Number(row.reimbursement_total),
  created_at: new Date(row.created_at).toISOString(),
});

const selectRows = async (sql: string, filter: CashMovementListFilter): Promise<RawRow[]> =>
  (await DataBase.instance.sequelize.query(sql, { type: QueryTypes.SELECT, replacements: baseReplacements(filter) })) as RawRow[];

const getManualMovements = async (filter: CashMovementListFilter): Promise<CashMovementListItem[]> => {
  const rows = await selectRows(
    `
      SELECT cm.id, cm.direction, cm.category, cm.amount, cm.description, cm.occurred_at, cm.quotation_id,
             cm.purchase_order_id, cm.business_unit_id, 1 AS moves_cash, cm.payment_account_id,
             pa.name AS payment_account_name, cm.created_at
      FROM cash_movement cm
      LEFT JOIN general_variable pa ON pa.id = cm.payment_account_id
      WHERE cm.is_deleted = false
        AND (:companyId IS NULL OR cm.company_id = :companyId)
        AND (:businessUnitId IS NULL OR cm.business_unit_id = :businessUnitId)
        AND (:direction IS NULL OR cm.direction = :direction)
        AND (:category IS NULL OR cm.category = :category)
        AND (:quotationId IS NULL OR cm.quotation_id = :quotationId)
        AND (:purchaseOrderId IS NULL OR cm.purchase_order_id = :purchaseOrderId)
        AND (:dateFrom IS NULL OR cm.occurred_at >= :dateFrom)
        AND (:dateTo IS NULL OR cm.occurred_at <= :dateTo)
        ${accountCondition("cm.payment_account_id", filter)}
    `,
    filter
  );

  return rows.map((row) => toItem("manual", "manual", row));
};

const getQuotationPaymentMovements = async (filter: CashMovementListFilter): Promise<CashMovementListItem[]> => {
  // Los pagos son siempre un ingreso sin orden de compra asociada — si se
  // pide "egreso" o un purchase_order_id puntual, ningún pago puede
  // matchear, así que se ahorra la consulta.
  if (filter.direction === "expense" || filter.purchaseOrderId) return [];

  const rows = await selectRows(
    `
      SELECT qp.id, 'income' AS direction, qp.method AS category, qp.amount, qp.notes AS description,
             qp.paid_at AS occurred_at, qp.quotation_id, NULL AS purchase_order_id, q.business_unit_id,
             1 AS moves_cash, qp.payment_account_id, pa.name AS payment_account_name, qp.created_at
      FROM quotation_payment qp
      INNER JOIN quotation q ON q.id = qp.quotation_id
      LEFT JOIN general_variable pa ON pa.id = qp.payment_account_id
      WHERE qp.is_deleted = false
        AND (:companyId IS NULL OR q.company_id = :companyId)
        AND (:businessUnitId IS NULL OR q.business_unit_id = :businessUnitId)
        AND (:quotationId IS NULL OR qp.quotation_id = :quotationId)
        AND (:category IS NULL OR qp.method = :category)
        AND (:dateFrom IS NULL OR qp.paid_at >= :dateFrom)
        AND (:dateTo IS NULL OR qp.paid_at <= :dateTo)
        ${accountCondition("qp.payment_account_id", filter)}
    `,
    filter
  );

  return rows.map((row) => toItem("quotation_payment", "qp", row));
};

const getQuotationExpenseMovements = async (filter: CashMovementListFilter): Promise<CashMovementListItem[]> => {
  if (filter.direction === "income") return [];

  // Con filtro de cuenta solo entran los gastos que pagó la empresa: uno
  // pagado por un trabajador no salió de ninguna cuenta (ni de efectivo).
  const accountFilter = filter.paymentAccountId === undefined
    ? ""
    : `${accountCondition("qe.payment_account_id", filter)} AND ${EXPENSE_PAID_BY_COMPANY_SQL}`;

  const rows = await selectRows(
    `
      SELECT qe.id, 'expense' AS direction, qe.category, qe.amount, qe.description, qe.spent_at AS occurred_at,
             qe.quotation_id, poi.purchase_order_id, q.business_unit_id,
             CASE WHEN ${EXPENSE_PAID_BY_COMPANY_SQL} THEN 1 ELSE 0 END AS moves_cash,
             CASE WHEN ${EXPENSE_PAID_BY_COMPANY_SQL} THEN qe.payment_account_id ELSE NULL END AS payment_account_id,
             CASE WHEN ${EXPENSE_PAID_BY_COMPANY_SQL} THEN pa.name ELSE NULL END AS payment_account_name,
             CASE WHEN fpop.funding_source = 'employee' THEN CONCAT(u.name, ' ', u.paternal_lastname) ELSE NULL END
               AS paid_by_employee_name,
             ed.status AS reimbursement_status, ed.paid_amount AS reimbursed_amount, ed.paid_at AS reimbursed_at,
             qe.created_at
      FROM quotation_expense qe
      INNER JOIN quotation q ON q.id = qe.quotation_id
      ${EXPENSE_FUNDING_JOIN_SQL}
      LEFT JOIN purchase_order_item poi ON poi.id = fpop.purchase_order_item_id
      LEFT JOIN employee_debt ed ON ed.purchase_order_item_purchase_id = fpop.id
      LEFT JOIN user u ON u.id = fpop.paid_by_user_id
      LEFT JOIN general_variable pa ON pa.id = qe.payment_account_id
      WHERE (:companyId IS NULL OR q.company_id = :companyId)
        AND (:businessUnitId IS NULL OR q.business_unit_id = :businessUnitId)
        AND (:quotationId IS NULL OR qe.quotation_id = :quotationId)
        AND (:purchaseOrderId IS NULL OR poi.purchase_order_id = :purchaseOrderId)
        AND (:category IS NULL OR qe.category = :category)
        AND (:dateFrom IS NULL OR qe.spent_at >= :dateFrom)
        AND (:dateTo IS NULL OR qe.spent_at <= :dateTo)
        ${accountFilter}
    `,
    filter
  );

  return rows.map((row) => toItem("quotation_expense", "qe", row));
};

// Deudas manuales: un gasto que el trabajador pagó con su plata fuera de una
// orden. Informativo (no mueve caja): no tiene cuenta, cotización ni orden.
const getManualDebtMovements = async (filter: CashMovementListFilter): Promise<CashMovementListItem[]> => {
  const cannotMatch =
    filter.direction === "income" ||
    filter.paymentAccountId !== undefined ||
    filter.quotationId !== undefined ||
    filter.purchaseOrderId !== undefined;
  if (cannotMatch) return [];

  const rows = await selectRows(
    `
      SELECT ed.id, 'expense' AS direction, ed.category, ed.amount, ed.description, ed.incurred_at AS occurred_at,
             NULL AS quotation_id, NULL AS purchase_order_id, ed.business_unit_id, 0 AS moves_cash,
             NULL AS payment_account_id, NULL AS payment_account_name,
             CONCAT(u.name, ' ', u.paternal_lastname) AS paid_by_employee_name,
             ed.status AS reimbursement_status, ed.paid_amount AS reimbursed_amount, ed.paid_at AS reimbursed_at,
             ed.created_at
      FROM employee_debt ed
      INNER JOIN user u ON u.id = ed.user_id
      WHERE ed.origin = 'manual' AND ed.status <> 'cancelled'
        AND (:companyId IS NULL OR ed.company_id = :companyId)
        AND (:businessUnitId IS NULL OR ed.business_unit_id = :businessUnitId)
        AND (:category IS NULL OR ed.category = :category)
        AND (:dateFrom IS NULL OR ed.incurred_at >= :dateFrom)
        AND (:dateTo IS NULL OR ed.incurred_at <= :dateTo)
    `,
    filter
  );

  return rows.map((row) => toItem("employee_debt", "ed", row));
};

// Reposiciones: el egreso real de lo que los trabajadores pagaron con su
// plata. Con filtro de tienda, cotización u orden, el monto es solo la
// parte de la reposición que cubrió deudas de ahí (ver cash_flow.sql.ts).
// MAX() en las columnas fijas de la reposición: MariaDB no reconoce la
// dependencia funcional con p.id bajo ONLY_FULL_GROUP_BY.
const getReimbursementMovements = async (filter: CashMovementListFilter): Promise<CashMovementListItem[]> => {
  if (filter.direction === "income" || filter.category !== undefined) return [];

  const rows = await selectRows(
    `
      SELECT p.id, 'expense' AS direction, NULL AS category, SUM(a.amount) AS amount,
             MAX(p.amount) AS reimbursement_total,
             CONCAT('Reposición a ', MAX(u.name), ' ', MAX(u.paternal_lastname)) AS description,
             MAX(p.paid_at) AS occurred_at, NULL AS quotation_id, NULL AS purchase_order_id,
             NULL AS business_unit_id, 1 AS moves_cash, MAX(p.payment_account_id) AS payment_account_id,
             MAX(pa.name) AS payment_account_name, MAX(p.created_at) AS created_at
      FROM ${REIMBURSEMENT_ALLOCATIONS_FROM_SQL}
      INNER JOIN user u ON u.id = p.user_id
      LEFT JOIN general_variable pa ON pa.id = p.payment_account_id
      WHERE ${REIMBURSEMENT_SCOPE_SQL}
        AND (:quotationId IS NULL OR rq.id = :quotationId)
        AND (:purchaseOrderId IS NULL OR rpo.id = :purchaseOrderId)
        AND (:dateFrom IS NULL OR p.paid_at >= :dateFrom)
        AND (:dateTo IS NULL OR p.paid_at <= :dateTo)
        ${accountCondition("p.payment_account_id", filter)}
      GROUP BY p.id
    `,
    filter
  );

  return rows.map((row) => toItem("employee_debt_payment", "edp", row));
};

const SOURCE_LOADERS: Record<CashMovementSource, (filter: CashMovementListFilter) => Promise<CashMovementListItem[]>> = {
  manual: getManualMovements,
  quotation_payment: getQuotationPaymentMovements,
  quotation_expense: getQuotationExpenseMovements,
  employee_debt: getManualDebtMovements,
  employee_debt_payment: getReimbursementMovements,
};

// Totales en céntimos (sin errores de redondeo), solo de lo que mueve caja.
const buildSummary = (rows: CashMovementListItem[]): CashMovementSummary => {
  const accounts = new Map<string, { id: number | null; name: string; income: number; expense: number }>();
  let incomeCents = 0;
  let expenseCents = 0;

  for (const row of rows) {
    if (!row.moves_cash) continue;
    const cents = toCents(row.amount);
    const key = row.payment_account_id === null ? "cash" : String(row.payment_account_id);
    const account = accounts.get(key) ?? {
      id: row.payment_account_id,
      name: row.payment_account_id === null ? "Efectivo" : (row.payment_account_name ?? "Cuenta"),
      income: 0,
      expense: 0,
    };
    if (row.direction === "income") {
      incomeCents += cents;
      account.income += cents;
    } else {
      expenseCents += cents;
      account.expense += cents;
    }
    accounts.set(key, account);
  }

  // Efectivo primero; después las cuentas por nombre.
  const byAccount = [...accounts.values()]
    .sort((a, b) => (a.id === null ? -1 : b.id === null ? 1 : a.name.localeCompare(b.name, "es")))
    .map((account) => ({
      payment_account_id: account.id,
      payment_account_name: account.name,
      income: fromCents(account.income),
      expense: fromCents(account.expense),
      net: fromCents(account.income - account.expense),
    }));

  return {
    income: fromCents(incomeCents),
    expense: fromCents(expenseCents),
    net: fromCents(incomeCents - expenseCents),
    by_account: byAccount,
  };
};

// Junta las fuentes pedidas, ordena por fecha (y created_at como desempate)
// y pagina en memoria — volumen esperado de un libro de caja de una pyme,
// nunca millones de filas (CLAUDE.md sección 8: evitar sobre-ingeniería
// para una escala que no existe). El resumen se calcula sobre TODO lo
// filtrado, no sobre la página.
const getCashMovementsList = async (filter: CashMovementListFilter): Promise<CashMovementListResult> => {
  const sources: CashMovementSource[] = filter.source ? [filter.source] : CASH_MOVEMENT_SOURCES;
  const results = await Promise.all(sources.map((source) => SOURCE_LOADERS[source](filter)));

  const merged = results.flat().sort((a, b) => {
    if (a.occurred_at !== b.occurred_at) return a.occurred_at < b.occurred_at ? 1 : -1;
    return a.created_at < b.created_at ? 1 : -1;
  });

  const total = merged.length;
  const offset = (filter.page - 1) * filter.limit;
  const data = merged.slice(offset, offset + filter.limit);

  return { data, meta: buildPaginationMeta(total, filter.page, filter.limit), summary: buildSummary(merged) };
};

const getCashMovementById = async (id: number) => {
  return DataBase.instance.cash_movement.findOne({ where: { id } });
};

export { getCashMovementsList, getCashMovementById };

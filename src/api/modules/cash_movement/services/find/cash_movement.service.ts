import { QueryTypes, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { CashMovementDirection } from "../../model/cash_movement.model";
import { buildPaginationMeta, PaginatedResult } from "../../../../../core/utils/paginate";
import { fromCents, toCents } from "../../../../../core/utils/money";
import { toDateOnlyString, todayInBusinessTz } from "../../../../../utils/dateUtils";
import {
  ADJUSTMENT_ENTRY_FROM_SQL,
  ADJUSTMENT_ENTRY_SCOPE_SQL,
  EXPENSE_ACTIVE_SQL,
  EXPENSE_FUNDING_JOIN_SQL,
  EXPENSE_PAID_BY_COMPANY_SQL,
  REIMBURSEMENT_ALLOCATIONS_FROM_SQL,
  REIMBURSEMENT_SCOPE_SQL,
} from "../shared/cash_flow.sql";
import { correctionsCountSql } from "../../../money_correction/services/shared/corrections_count";
import { parseMoneyCorrectionValues } from "../../../money_correction/services/find/money_correction.service";
import {
  CashAdjustmentAction,
  CashAdjustmentLegType,
  CashEntryKind,
  CashPeriodStatus,
  CashRowAdjustmentInfo,
  CashRowPeriodStatus,
} from "../../../cash_closing/types/cash_closing.types";
import {
  buildCashPeriodStatus,
  CashPeriodMap,
  CashPeriodState,
  periodStatusOfDate,
} from "../../../cash_closing/services/shared/period_state.service";

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
  // Empresa del movimiento: el Super Administrador la necesita para ofrecer
  // las cuentas correctas al corregir uno.
  company_id: number;
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
  // Cuántas correcciones tiene la fila (badge "Corregido" + historial), de
  // cualquier fuente: cada una guarda su historial en money_correction.
  corrections_count: number;
  // Solo en filas "quotation_expense" que son una COMPRA de una orden: id de la
  // compra (purchase_order_item_purchase). Con él, Caja abre el diálogo de
  // corregir compra en vez del de corregir gasto. Null = gasto manual.
  purchase_id: number | null;
  // Solo en filas "employee_debt": origen de la deuda. Caja solo lista las
  // manuales (las de compra se corrigen desde la compra), pero se expone para
  // que el frontend no tenga que suponerlo.
  debt_origin: "manual" | "purchase" | null;
  created_at: string;
  // Cierre de caja (fase 2):
  //   - movement     = fila real de su fuente;
  //   - closing_hold = pata "Valor al cierre": mantiene un mes cerrado tal
  //     como se cerró (fecha original, monto con signo, puede ser negativo);
  //   - adjustment   = pata "Ajuste": la diferencia, registrada el día de la
  //     corrección en el mes abierto (monto con signo).
  entry_kind: CashEntryKind;
  // Estado del mes de la fila (candado en Caja). Solo se calcula para las
  // filas de la página.
  period_status: CashRowPeriodStatus;
  // Solo en las patas: qué corrección las generó y por qué.
  adjustment: CashRowAdjustmentInfo | null;
}

export interface CashAccountSummary {
  // null = efectivo.
  payment_account_id: number | null;
  payment_account_name: string;
  income: number;
  expense: number;
  // Ajustes de meses cerrados registrados en el rango (patas "adjustment",
  // con signo: lo que suman o restan al saldo).
  adjustments: number;
  net: number;
}

// Totales de TODO lo filtrado (no de la página), solo con lo que mueve caja.
// net = income − expense + adjustments. Las patas "Valor al cierre" ya van
// dentro de income/expense (con signo), así un mes cerrado suma exactamente
// lo que sumaba al cerrarse.
export interface CashMovementSummary {
  income: number;
  expense: number;
  adjustments: number;
  net: number;
  by_account: CashAccountSummary[];
}

export interface CashMovementListResult extends PaginatedResult<CashMovementListItem> {
  summary: CashMovementSummary;
  // Estado del cierre de la empresa filtrada (mismo shape que GET
  // /cash-closing/status); null si un Super Administrador no eligió empresa.
  cash_period: CashPeriodStatus | null;
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

// Mismos filtros sin paginar, para los totales (cierres de caja, saldos). Con
// `transaction`, todas las consultas corren en la conexión de esa
// transacción (el cierre lee dentro de su transacción READ COMMITTED).
export type CashFlowFilter = Omit<CashMovementListFilter, "page" | "limit"> & { transaction?: Transaction };

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
  company_id: number;
  moves_cash: number | string;
  payment_account_id: number | null;
  payment_account_name: string | null;
  paid_by_employee_name?: string | null;
  reimbursement_status?: "pending" | "paid" | null;
  reimbursed_amount?: string | null;
  reimbursed_at?: string | null;
  reimbursement_total?: string | null;
  corrections_count?: number | string | null;
  purchase_id?: number | string | null;
  debt_origin?: "manual" | "purchase" | null;
  created_at: Date;
}

// Condición de cuenta reutilizada por las consultas. `column` es siempre
// un nombre fijo del código, nunca un valor del usuario (que va bindeado).
const accountCondition = (column: string, filter: CashFlowFilter): string => {
  if (filter.paymentAccountId === "cash") return `AND ${column} IS NULL`;
  if (typeof filter.paymentAccountId === "number") return `AND ${column} = :paymentAccountId`;
  return "";
};

const baseReplacements = (filter: CashFlowFilter) => ({
  companyId: filter.companyId,
  businessUnitId: filter.businessUnitId ?? null,
  quotationId: filter.quotationId ?? null,
  purchaseOrderId: filter.purchaseOrderId ?? null,
  category: filter.category ?? null,
  direction: filter.direction ?? null,
  source: filter.source ?? null,
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
  company_id: Number(row.company_id),
  moves_cash: Number(row.moves_cash) === 1,
  payment_account_id: row.payment_account_id,
  payment_account_name: row.payment_account_name,
  paid_by_employee_name: row.paid_by_employee_name ?? null,
  reimbursement_status: row.reimbursement_status ?? null,
  reimbursed_amount: row.reimbursed_amount === null || row.reimbursed_amount === undefined ? null : Number(row.reimbursed_amount),
  reimbursed_at: row.reimbursed_at ?? null,
  reimbursement_total:
    row.reimbursement_total === null || row.reimbursement_total === undefined ? null : Number(row.reimbursement_total),
  corrections_count: Number(row.corrections_count ?? 0),
  purchase_id: row.purchase_id === null || row.purchase_id === undefined ? null : Number(row.purchase_id),
  debt_origin: row.debt_origin ?? null,
  created_at: new Date(row.created_at).toISOString(),
  entry_kind: "movement",
  // Se completa después, solo para las filas de la página (ver withPeriodStatus).
  period_status: "no_ledger",
  adjustment: null,
});

const selectRows = async <T = RawRow>(sql: string, filter: CashFlowFilter): Promise<T[]> =>
  (await DataBase.instance.sequelize.query(sql, {
    type: QueryTypes.SELECT,
    replacements: baseReplacements(filter),
    transaction: filter.transaction,
  })) as T[];

// corrections_count: cuántas correcciones tiene cada fila, dentro de la MISMA
// consulta (nunca una consulta aparte por fila) y en TODAS las fuentes. La
// subconsulta cuenta sobre el índice (source_type, source_id, created_at) de
// money_correction.
const getManualMovements = async (filter: CashFlowFilter): Promise<CashMovementListItem[]> => {
  const rows = await selectRows(
    `
      SELECT cm.id, cm.direction, cm.category, cm.amount, cm.description, cm.occurred_at, cm.quotation_id,
             cm.purchase_order_id, cm.business_unit_id, cm.company_id, 1 AS moves_cash, cm.payment_account_id,
             pa.name AS payment_account_name,
             ${correctionsCountSql("manual", "cm.id")} AS corrections_count,
             cm.created_at
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

const getQuotationPaymentMovements = async (filter: CashFlowFilter): Promise<CashMovementListItem[]> => {
  // Los pagos son siempre un ingreso sin orden de compra asociada — si se
  // pide "egreso" o un purchase_order_id puntual, ningún pago puede
  // matchear, así que se ahorra la consulta.
  if (filter.direction === "expense" || filter.purchaseOrderId) return [];

  const rows = await selectRows(
    `
      SELECT qp.id, 'income' AS direction, qp.method AS category, qp.amount, qp.notes AS description,
             qp.paid_at AS occurred_at, qp.quotation_id, NULL AS purchase_order_id, q.business_unit_id, q.company_id,
             1 AS moves_cash, qp.payment_account_id, pa.name AS payment_account_name,
             ${correctionsCountSql("quotation_payment", "qp.id")} AS corrections_count, qp.created_at
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

const getQuotationExpenseMovements = async (filter: CashFlowFilter): Promise<CashMovementListItem[]> => {
  if (filter.direction === "income") return [];

  // Con filtro de cuenta solo entran los gastos que pagó la empresa: uno
  // pagado por un trabajador no salió de ninguna cuenta (ni de efectivo).
  const accountFilter = filter.paymentAccountId === undefined
    ? ""
    : `${accountCondition("qe.payment_account_id", filter)} AND ${EXPENSE_PAID_BY_COMPANY_SQL}`;

  const rows = await selectRows(
    `
      SELECT qe.id, 'expense' AS direction, qe.category, qe.amount, qe.description, qe.spent_at AS occurred_at,
             qe.quotation_id, poi.purchase_order_id, q.business_unit_id, q.company_id,
             CASE WHEN ${EXPENSE_PAID_BY_COMPANY_SQL} THEN 1 ELSE 0 END AS moves_cash,
             CASE WHEN ${EXPENSE_PAID_BY_COMPANY_SQL} THEN qe.payment_account_id ELSE NULL END AS payment_account_id,
             CASE WHEN ${EXPENSE_PAID_BY_COMPANY_SQL} THEN pa.name ELSE NULL END AS payment_account_name,
             CASE WHEN fpop.funding_source = 'employee' THEN CONCAT(u.name, ' ', u.paternal_lastname) ELSE NULL END
               AS paid_by_employee_name,
             ed.status AS reimbursement_status, ed.paid_amount AS reimbursed_amount, ed.paid_at AS reimbursed_at,
             fpop.id AS purchase_id,
             ${correctionsCountSql("quotation_expense", "qe.id")} AS corrections_count,
             qe.created_at
      FROM quotation_expense qe
      INNER JOIN quotation q ON q.id = qe.quotation_id
      ${EXPENSE_FUNDING_JOIN_SQL}
      LEFT JOIN purchase_order_item poi ON poi.id = fpop.purchase_order_item_id
      LEFT JOIN employee_debt ed ON ed.purchase_order_item_purchase_id = fpop.id
      LEFT JOIN user u ON u.id = fpop.paid_by_user_id
      LEFT JOIN general_variable pa ON pa.id = qe.payment_account_id
      WHERE ${EXPENSE_ACTIVE_SQL}
        AND (:companyId IS NULL OR q.company_id = :companyId)
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
const getManualDebtMovements = async (filter: CashFlowFilter): Promise<CashMovementListItem[]> => {
  const cannotMatch =
    filter.direction === "income" ||
    filter.paymentAccountId !== undefined ||
    filter.quotationId !== undefined ||
    filter.purchaseOrderId !== undefined;
  if (cannotMatch) return [];

  const rows = await selectRows(
    `
      SELECT ed.id, 'expense' AS direction, ed.category, ed.amount, ed.description, ed.incurred_at AS occurred_at,
             NULL AS quotation_id, NULL AS purchase_order_id, ed.business_unit_id, ed.company_id, 0 AS moves_cash,
             NULL AS payment_account_id, NULL AS payment_account_name,
             CONCAT(u.name, ' ', u.paternal_lastname) AS paid_by_employee_name,
             ed.status AS reimbursement_status, ed.paid_amount AS reimbursed_amount, ed.paid_at AS reimbursed_at,
             ed.origin AS debt_origin,
             ${correctionsCountSql("employee_debt", "ed.id")} AS corrections_count,
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
const getReimbursementMovements = async (filter: CashFlowFilter): Promise<CashMovementListItem[]> => {
  if (filter.direction === "income" || filter.category !== undefined) return [];

  const rows = await selectRows(
    `
      SELECT p.id, 'expense' AS direction, NULL AS category, SUM(a.amount) AS amount,
             MAX(p.amount) AS reimbursement_total,
             CONCAT('Reposición a ', MAX(u.name), ' ', MAX(u.paternal_lastname)) AS description,
             MAX(p.paid_at) AS occurred_at, NULL AS quotation_id, NULL AS purchase_order_id,
             NULL AS business_unit_id, MAX(p.company_id) AS company_id, 1 AS moves_cash,
             MAX(p.payment_account_id) AS payment_account_id,
             MAX(pa.name) AS payment_account_name,
             ${correctionsCountSql("employee_debt_payment", "p.id")} AS corrections_count,
             MAX(p.created_at) AS created_at
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

interface RawAdjustmentRow {
  id: number;
  source_type: CashMovementSource;
  source_id: number;
  leg: CashAdjustmentLegType;
  direction: CashMovementDirection;
  amount: string;
  occurred_at: string | Date;
  quotation_id: number | null;
  purchase_order_id: number | null;
  business_unit_id: number | null;
  company_id: number;
  payment_account_id: number | null;
  payment_account_name: string | null;
  affected_period: string;
  money_correction_id: number;
  posted_date: string | Date | null;
  reason: string;
  previous_values: unknown;
  new_values: unknown;
  created_by_name: string | null;
  corrections_count: number | string | null;
  purchase_id: number | string | null;
  created_at: Date;
}

const nullableNumber = (value: unknown): number | null =>
  value === null || value === undefined || value === "" ? null : Number(value);

// Qué hizo la corrección padre: anular/restaurar guardan { is_deleted } en
// sus valores (core/money/cashPeriod.ts → toggleAdjustmentValues).
const adjustmentActionOf = (nextValues: Record<string, unknown>): CashAdjustmentAction => {
  if (!("is_deleted" in nextValues)) return "correction";
  return Number(nextValues.is_deleted) === 1 ? "annul" : "restore";
};

const toAdjustmentItem = (row: RawAdjustmentRow): CashMovementListItem => {
  const previous = parseMoneyCorrectionValues(row.previous_values, row.source_type);
  const next = parseMoneyCorrectionValues(row.new_values, row.source_type);
  const occurredAt = toDateOnlyString(row.occurred_at);
  return {
    id: `adj-${row.id}`,
    source: row.source_type,
    source_id: Number(row.source_id),
    direction: row.direction,
    category: null,
    amount: Number(row.amount),
    description: null,
    occurred_at: occurredAt,
    quotation_id: nullableNumber(row.quotation_id),
    purchase_order_id: nullableNumber(row.purchase_order_id),
    business_unit_id: nullableNumber(row.business_unit_id),
    company_id: Number(row.company_id),
    moves_cash: true,
    payment_account_id: nullableNumber(row.payment_account_id),
    payment_account_name: row.payment_account_name,
    paid_by_employee_name: null,
    reimbursement_status: null,
    reimbursed_amount: null,
    reimbursed_at: null,
    reimbursement_total: null,
    corrections_count: Number(row.corrections_count ?? 0),
    purchase_id: nullableNumber(row.purchase_id),
    debt_origin: null,
    created_at: new Date(row.created_at).toISOString(),
    entry_kind: row.leg === "hold" ? "closing_hold" : "adjustment",
    period_status: "no_ledger",
    adjustment: {
      correction_id: Number(row.money_correction_id),
      affected_period: row.affected_period,
      posted_date: row.posted_date === null ? occurredAt : toDateOnlyString(row.posted_date),
      action: adjustmentActionOf(next),
      previous_amount: typeof previous.amount === "number" || typeof previous.amount === "string" ? Number(previous.amount) : null,
      new_amount: typeof next.amount === "number" || typeof next.amount === "string" ? Number(next.amount) : null,
      reason: row.reason,
      created_by_name: row.created_by_name,
    },
  };
};

// 6.º lector: patas de ajuste del cierre de caja (cash_adjustment_entry).
// Mismos filtros que el resto sobre la pata (`e`): fuente, sentido,
// cotización, orden, fecha, cuenta y empresa/tienda. Las patas no tienen
// categoría: con filtro de categoría no entra ninguna (limitación
// documentada en el README de cierres).
const getAdjustmentEntries = async (filter: CashFlowFilter): Promise<CashMovementListItem[]> => {
  if (filter.category !== undefined) return [];

  const rows = await selectRows<RawAdjustmentRow>(
    `
      SELECT e.id, e.source_type, e.source_id, e.leg, e.direction, e.amount, e.entry_date AS occurred_at,
             e.quotation_id, e.purchase_order_id, e.business_unit_id, e.company_id, e.payment_account_id,
             pa.name AS payment_account_name, e.affected_period, e.money_correction_id,
             (SELECT MAX(pe.entry_date) FROM cash_adjustment_entry pe
               WHERE pe.money_correction_id = e.money_correction_id AND pe.leg = 'posting') AS posted_date,
             mc.reason, mc.previous_values, mc.new_values,
             CONCAT(u.name, ' ', u.paternal_lastname) AS created_by_name,
             (SELECT COUNT(*) FROM money_correction cc
               WHERE cc.source_type = e.source_type AND cc.source_id = e.source_id) AS corrections_count,
             CASE WHEN e.source_type = 'quotation_expense'
               THEN (SELECT MAX(ap.id) FROM purchase_order_item_purchase ap WHERE ap.quotation_expense_id = e.source_id)
               ELSE NULL END AS purchase_id,
             e.created_at
      FROM ${ADJUSTMENT_ENTRY_FROM_SQL}
      LEFT JOIN user u ON u.id = mc.created_by
      WHERE ${ADJUSTMENT_ENTRY_SCOPE_SQL}
        AND (:source IS NULL OR e.source_type = :source)
        AND (:direction IS NULL OR e.direction = :direction)
        AND (:quotationId IS NULL OR e.quotation_id = :quotationId)
        AND (:purchaseOrderId IS NULL OR e.purchase_order_id = :purchaseOrderId)
        AND (:dateFrom IS NULL OR e.entry_date >= :dateFrom)
        AND (:dateTo IS NULL OR e.entry_date <= :dateTo)
        ${accountCondition("e.payment_account_id", filter)}
    `,
    filter
  );

  return rows.map(toAdjustmentItem);
};

const SOURCE_LOADERS: Record<CashMovementSource, (filter: CashFlowFilter) => Promise<CashMovementListItem[]>> = {
  manual: getManualMovements,
  quotation_payment: getQuotationPaymentMovements,
  quotation_expense: getQuotationExpenseMovements,
  employee_debt: getManualDebtMovements,
  employee_debt_payment: getReimbursementMovements,
};

// Todas las filas filtradas (las 5 fuentes, o la pedida, + las patas de
// ajuste), sin ordenar ni paginar.
const loadCashFlowRows = async (filter: CashFlowFilter): Promise<CashMovementListItem[]> => {
  const sources: CashMovementSource[] = filter.source ? [filter.source] : CASH_MOVEMENT_SOURCES;
  const loaders = [...sources.map((source) => SOURCE_LOADERS[source]), getAdjustmentEntries];
  const results = await Promise.all(loaders.map((loader) => loader(filter)));
  return results.flat();
};

interface AccountCents {
  id: number | null;
  name: string;
  income: number;
  expense: number;
  adjustments: number;
}

// Efecto de una fila en el saldo, en céntimos con signo.
const netCents = (direction: CashMovementDirection, cents: number): number => (direction === "income" ? cents : -cents);

// Totales en céntimos (sin errores de redondeo), solo de lo que mueve caja.
//   - movement y closing_hold suman a income/expense según su sentido (una
//     pata "Valor al cierre" lleva signo: puede restar);
//   - adjustment (pata posting) va a `adjustments` con su efecto en el saldo.
const buildSummary = (rows: CashMovementListItem[]): CashMovementSummary => {
  const accounts = new Map<string, AccountCents>();
  let incomeCents = 0;
  let expenseCents = 0;
  let adjustmentCents = 0;

  for (const row of rows) {
    if (!row.moves_cash) continue;
    const cents = toCents(row.amount);
    const key = row.payment_account_id === null ? "cash" : String(row.payment_account_id);
    const current = accounts.get(key) ?? {
      id: row.payment_account_id,
      name: row.payment_account_id === null ? "Efectivo" : (row.payment_account_name ?? "Cuenta"),
      income: 0,
      expense: 0,
      adjustments: 0,
    };
    if (row.entry_kind === "adjustment") {
      const effect = netCents(row.direction, cents);
      adjustmentCents += effect;
      accounts.set(key, { ...current, adjustments: current.adjustments + effect });
      continue;
    }
    if (row.direction === "income") {
      incomeCents += cents;
      accounts.set(key, { ...current, income: current.income + cents });
      continue;
    }
    expenseCents += cents;
    accounts.set(key, { ...current, expense: current.expense + cents });
  }

  // Efectivo primero; después las cuentas por nombre.
  const byAccount = [...accounts.values()]
    .sort((a, b) => (a.id === null ? -1 : b.id === null ? 1 : a.name.localeCompare(b.name, "es")))
    .map((account) => ({
      payment_account_id: account.id,
      payment_account_name: account.name,
      income: fromCents(account.income),
      expense: fromCents(account.expense),
      adjustments: fromCents(account.adjustments),
      net: fromCents(account.income - account.expense + account.adjustments),
    }));

  return {
    income: fromCents(incomeCents),
    expense: fromCents(expenseCents),
    adjustments: fromCents(adjustmentCents),
    net: fromCents(incomeCents - expenseCents + adjustmentCents),
    by_account: byAccount,
  };
};

/**
 * Totales de Caja (mismo cálculo que el resumen del listado) sin paginar ni
 * armar filas para el cliente. Es la ÚNICA fuente de los números del cierre
 * de caja y de los saldos (cash_closing/services/shared/balances.service.ts):
 * así un mes cerrado siempre coincide con lo que muestra Caja para ese rango.
 */
const getCashFlowSummary = async (filter: CashFlowFilter): Promise<CashMovementSummary> =>
  buildSummary(await loadCashFlowRows(filter));

// Libro + meses de varias empresas en dos consultas (las empresas de una
// página de Caja: un Super Administrador sin empresa elegida ve varias).
const loadPeriodMaps = async (companyIds: number[]): Promise<Map<number, CashPeriodMap>> => {
  const maps = new Map<number, CashPeriodMap>();
  if (companyIds.length === 0) return maps;

  const ledgers = await DataBase.instance.cash_ledger.findAll({ where: { company_id: companyIds } });
  const ledgerCompanyIds = ledgers.map((ledger) => Number(ledger.company_id));
  const periodRows =
    ledgerCompanyIds.length === 0
      ? []
      : await DataBase.instance.cash_period.findAll({ where: { company_id: ledgerCompanyIds }, order: [["period", "ASC"]] });

  for (const ledger of ledgers) {
    const companyId = Number(ledger.company_id);
    const periods = new Map<string, CashPeriodState>(
      periodRows
        .filter((row) => Number(row.company_id) === companyId)
        .map((row) => [
          row.period,
          { id: Number(row.id), period: row.period, status: row.status, closeCount: Number(row.close_count) },
        ])
    );
    maps.set(companyId, {
      ledger: {
        id: Number(ledger.id),
        companyId,
        startPeriod: ledger.start_period,
        startDate: toDateOnlyString(ledger.start_date),
        notes: ledger.notes,
      },
      periods,
    });
  }
  return maps;
};

const EMPTY_PERIOD_MAP: CashPeriodMap = { ledger: null, periods: new Map() };

// Candado de cada fila de la página: estado del mes de su fecha en el libro
// de SU empresa.
const withPeriodStatus = (rows: CashMovementListItem[], maps: Map<number, CashPeriodMap>): CashMovementListItem[] =>
  rows.map((row) => ({
    ...row,
    period_status: periodStatusOfDate(maps.get(row.company_id) ?? EMPTY_PERIOD_MAP, row.occurred_at),
  }));

// Junta las fuentes pedidas, ordena por fecha (y created_at como desempate)
// y pagina en memoria — volumen esperado de un libro de caja de una pyme,
// nunca millones de filas (CLAUDE.md sección 8: evitar sobre-ingeniería
// para una escala que no existe). El resumen se calcula sobre TODO lo
// filtrado, no sobre la página.
const getCashMovementsList = async (filter: CashMovementListFilter): Promise<CashMovementListResult> => {
  const merged = (await loadCashFlowRows(filter)).sort((a, b) => {
    if (a.occurred_at !== b.occurred_at) return a.occurred_at < b.occurred_at ? 1 : -1;
    return a.created_at < b.created_at ? 1 : -1;
  });

  const total = merged.length;
  const offset = (filter.page - 1) * filter.limit;
  const page = merged.slice(offset, offset + filter.limit);

  const companyIds = [...new Set([...page.map((row) => row.company_id), ...(filter.companyId === null ? [] : [filter.companyId])])];
  const maps = await loadPeriodMaps(companyIds);
  const cashPeriod =
    filter.companyId === null
      ? null
      : buildCashPeriodStatus(maps.get(filter.companyId) ?? EMPTY_PERIOD_MAP, todayInBusinessTz());

  return {
    data: withPeriodStatus(page, maps),
    meta: buildPaginationMeta(total, filter.page, filter.limit),
    summary: buildSummary(merged),
    cash_period: cashPeriod,
  };
};

const getCashMovementById = async (id: number) => {
  return DataBase.instance.cash_movement.findOne({ where: { id } });
};

export { getCashMovementsList, getCashMovementById, getCashFlowSummary };

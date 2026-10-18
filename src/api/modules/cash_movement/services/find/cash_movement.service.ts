import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";
import { CashMovementDirection } from "../../model/cash_movement.model";
import { buildPaginationMeta, PaginatedResult } from "../../../../../core/utils/paginate";

// Shape normalizado común a las 3 fuentes que se juntan en un solo listado
// (pedido explícito del usuario: "lo que se registra en la cotización se
// listan ahí y los que se saca también se lista, toda entra y salida de
// dinero") — "manual" es la tabla cash_movement; "quotation_payment"/
// "quotation_expense" son los que YA se registran en sus propias pantallas
// (Pagos/Gastos de una cotización, y toda compra de una orden ya genera un
// gasto, ver purchase_order_item_purchase.service.ts) — nunca se duplican,
// solo se reflejan acá para tener un libro de caja único.
export type CashMovementSource = "manual" | "quotation_payment" | "quotation_expense";

export interface CashMovementListItem {
  id: string;
  source: CashMovementSource;
  // Solo los movimientos "manual" se pueden deshabilitar desde este módulo
  // — los otros dos se gestionan desde su propia pantalla de origen.
  source_id: number;
  direction: CashMovementDirection;
  category: string | null;
  amount: number;
  description: string | null;
  occurred_at: string;
  quotation_id: number | null;
  purchase_order_id: number | null;
  business_unit_id: number | null;
  // Cuenta por la que entró/salió el dinero (null = efectivo). En los
  // gastos de compras pagadas por un trabajador es la cuenta desde la que
  // se le REPUSO (ver reimbursement_*).
  payment_account_id: number | null;
  payment_account_name: string | null;
  // Solo en gastos de compras pagadas con plata de un trabajador: quién puso
  // el dinero y si ya se le repuso (pedido explícito del usuario: "debería
  // decirse que ese gasto lo hizo tal trabajador y se le repuso").
  paid_by_employee_name: string | null;
  reimbursement_status: "pending" | "paid" | null;
  reimbursed_at: string | null;
  created_at: string;
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
  payment_account_id: number | null;
  payment_account_name: string | null;
  paid_by_employee_name?: string | null;
  reimbursement_status?: "pending" | "paid" | null;
  reimbursed_at?: string | null;
  created_at: Date;
}

// Condición de cuenta reutilizada por las 3 consultas. `column` es siempre
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
  payment_account_id: row.payment_account_id,
  payment_account_name: row.payment_account_name,
  paid_by_employee_name: row.paid_by_employee_name ?? null,
  reimbursement_status: row.reimbursement_status ?? null,
  reimbursed_at: row.reimbursed_at ?? null,
  created_at: new Date(row.created_at).toISOString(),
});

const getManualMovements = async (filter: CashMovementListFilter): Promise<CashMovementListItem[]> => {
  const rows = (await DataBase.instance.sequelize.query(
    `
      SELECT cm.id, cm.direction, cm.category, cm.amount, cm.description, cm.occurred_at, cm.quotation_id,
             cm.purchase_order_id, cm.business_unit_id, cm.payment_account_id, pa.name AS payment_account_name,
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
    { type: QueryTypes.SELECT, replacements: baseReplacements(filter) }
  )) as RawRow[];

  return rows.map((row) => toItem("manual", "manual", row));
};

const getQuotationPaymentMovements = async (filter: CashMovementListFilter): Promise<CashMovementListItem[]> => {
  // Los pagos son siempre un ingreso sin orden de compra asociada — si se
  // pide "egreso" o un purchase_order_id puntual, ningún pago puede
  // matchear, así que se ahorra la consulta.
  if (filter.direction === "expense" || filter.purchaseOrderId) return [];

  const rows = (await DataBase.instance.sequelize.query(
    `
      SELECT qp.id, 'income' AS direction, qp.method AS category, qp.amount, qp.notes AS description,
             qp.paid_at AS occurred_at, qp.quotation_id, NULL AS purchase_order_id, q.business_unit_id,
             qp.payment_account_id, pa.name AS payment_account_name, qp.created_at
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
    { type: QueryTypes.SELECT, replacements: baseReplacements(filter) }
  )) as RawRow[];

  return rows.map((row) => toItem("quotation_payment", "qp", row));
};

const getQuotationExpenseMovements = async (filter: CashMovementListFilter): Promise<CashMovementListItem[]> => {
  if (filter.direction === "income") return [];

  // Un gasto de compra pagada por un trabajador trae quién puso el dinero y
  // el estado de su reposición (employee_debt). La "cuenta" de ese gasto es
  // desde la que se le repuso, si ya se le repuso.
  const rows = (await DataBase.instance.sequelize.query(
    `
      SELECT qe.id, 'expense' AS direction, qe.category, qe.amount, qe.description, qe.spent_at AS occurred_at,
             qe.quotation_id, poi.purchase_order_id, q.business_unit_id,
             ed.payment_account_id, pa.name AS payment_account_name,
             CASE WHEN pop.funding_source = 'employee'
                  THEN CONCAT(u.name, ' ', u.paternal_lastname) ELSE NULL END AS paid_by_employee_name,
             ed.status AS reimbursement_status, ed.paid_at AS reimbursed_at,
             qe.created_at
      FROM quotation_expense qe
      INNER JOIN quotation q ON q.id = qe.quotation_id
      LEFT JOIN purchase_order_item_purchase pop ON pop.quotation_expense_id = qe.id
      LEFT JOIN purchase_order_item poi ON poi.id = pop.purchase_order_item_id
      LEFT JOIN employee_debt ed ON ed.purchase_order_item_purchase_id = pop.id
      LEFT JOIN user u ON u.id = pop.paid_by_user_id
      LEFT JOIN general_variable pa ON pa.id = ed.payment_account_id
      WHERE (:companyId IS NULL OR q.company_id = :companyId)
        AND (:businessUnitId IS NULL OR q.business_unit_id = :businessUnitId)
        AND (:quotationId IS NULL OR qe.quotation_id = :quotationId)
        AND (:purchaseOrderId IS NULL OR poi.purchase_order_id = :purchaseOrderId)
        AND (:category IS NULL OR qe.category = :category)
        AND (:dateFrom IS NULL OR qe.spent_at >= :dateFrom)
        AND (:dateTo IS NULL OR qe.spent_at <= :dateTo)
        ${accountCondition("ed.payment_account_id", filter)}
    `,
    { type: QueryTypes.SELECT, replacements: baseReplacements(filter) }
  )) as RawRow[];

  return rows.map((row) => toItem("quotation_expense", "qe", row));
};

const SOURCE_LOADERS: Record<CashMovementSource, (filter: CashMovementListFilter) => Promise<CashMovementListItem[]>> = {
  manual: getManualMovements,
  quotation_payment: getQuotationPaymentMovements,
  quotation_expense: getQuotationExpenseMovements,
};

// Junta las fuentes pedidas, ordena por fecha (y created_at como desempate)
// y pagina en memoria — volumen esperado de un libro de caja de una pyme,
// nunca millones de filas (CLAUDE.md sección 8: evitar sobre-ingeniería
// para una escala que no existe).
const getCashMovementsList = async (filter: CashMovementListFilter): Promise<PaginatedResult<CashMovementListItem>> => {
  const sources: CashMovementSource[] = filter.source ? [filter.source] : ["manual", "quotation_payment", "quotation_expense"];
  const results = await Promise.all(sources.map((source) => SOURCE_LOADERS[source](filter)));

  const merged = results.flat().sort((a, b) => {
    if (a.occurred_at !== b.occurred_at) return a.occurred_at < b.occurred_at ? 1 : -1;
    return a.created_at < b.created_at ? 1 : -1;
  });

  const total = merged.length;
  const offset = (filter.page - 1) * filter.limit;
  const data = merged.slice(offset, offset + filter.limit);

  return { data, meta: buildPaginationMeta(total, filter.page, filter.limit) };
};

const getCashMovementById = async (id: number) => {
  return DataBase.instance.cash_movement.findOne({ where: { id } });
};

export { getCashMovementsList, getCashMovementById };

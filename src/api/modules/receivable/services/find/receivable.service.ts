import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";
import { buildPaginationMeta, PaginatedResult } from "../../../../../core/utils/paginate";
import { QuotationStatus } from "../../../quotation/model/quotation.model";

// "Lo que me falta cobrar" (pedido explícito del usuario): cotizaciones ya
// comprometidas por el cliente cuyo saldo (total - total_paid) sigue
// pendiente. No es una tabla propia: se calcula sobre `quotation`, que ya
// guarda total y total_paid (este último recalculado en cada pago).
//
// Solo cuentan los estados en los que el cliente ya aceptó: una cotización
// pendiente todavía no es una deuda, y una rechazada/vencida/cancelada ya no
// se va a cobrar.
export const RECEIVABLE_STATUSES: QuotationStatus[] = [
  "accepted",
  "design_pending",
  "in_process",
  "ready",
  "delivered",
  "finished",
];

// Margen de un céntimo (mismo criterio que OVERPAY_TOLERANCE en pagos):
// un saldo de S/ 0.004 por redondeo no es una deuda real.
export const RECEIVABLE_MIN_BALANCE = 0.01;
const MIN_BALANCE = RECEIVABLE_MIN_BALANCE;

export type ReceivableOrderBy = "created_at" | "balance" | "total";

// Columna real por cada orden permitido — nunca se interpola un valor que
// venga del usuario.
const ORDER_COLUMN: Record<ReceivableOrderBy, string> = {
  created_at: "q.created_at",
  balance: "balance",
  total: "q.total",
};

export interface ReceivableListFilter {
  // null = is_system (ve todas las empresas).
  companyId: number | null;
  businessUnitId?: number;
  status?: QuotationStatus;
  clientName?: string;
  // Fecha de emisión de la cotización (YYYY-MM-DD, hora de Lima).
  dateFrom?: string;
  dateTo?: string;
  orderBy: ReceivableOrderBy;
  orderDir: "asc" | "desc";
  page: number;
  limit: number;
}

export interface ReceivableListItem {
  quotation_id: number;
  client_id: number;
  client_name: string;
  status: QuotationStatus;
  total: number;
  total_paid: number;
  balance: number;
  business_unit_id: number | null;
  created_at: string;
  // Último pago recibido (YYYY-MM-DD) o null si nunca pagó nada.
  last_paid_at: string | null;
}

export interface ReceivableSummary {
  // Totales de TODO lo filtrado (no solo de la página visible).
  total_balance: number;
  quotation_count: number;
}

interface RawReceivableRow {
  quotation_id: number;
  client_id: number;
  client_name: string;
  status: QuotationStatus;
  total: string;
  total_paid: string;
  balance: string;
  business_unit_id: number | null;
  created_at: Date;
  last_paid_at: string | null;
}

const buildWhere = (filter: ReceivableListFilter) => {
  const conditions: string[] = [
    "q.is_deleted = false",
    "q.status IN (:statuses)",
    "(q.total - q.total_paid) >= :minBalance",
    "(:companyId IS NULL OR q.company_id = :companyId)",
  ];
  if (filter.businessUnitId !== undefined) conditions.push("q.business_unit_id = :businessUnitId");
  if (filter.status) conditions.push("q.status = :status");
  if (filter.clientName) conditions.push("c.name LIKE :clientName");
  // created_at es UTC: se pasa a hora de Lima antes de comparar el día.
  if (filter.dateFrom) conditions.push("DATE(CONVERT_TZ(q.created_at, '+00:00', '-05:00')) >= :dateFrom");
  if (filter.dateTo) conditions.push("DATE(CONVERT_TZ(q.created_at, '+00:00', '-05:00')) <= :dateTo");

  const replacements = {
    statuses: RECEIVABLE_STATUSES,
    minBalance: MIN_BALANCE,
    companyId: filter.companyId,
    businessUnitId: filter.businessUnitId ?? null,
    status: filter.status ?? null,
    // Valor bindeado (nunca interpolado): el % va dentro del parámetro.
    clientName: filter.clientName ? `%${filter.clientName}%` : null,
    dateFrom: filter.dateFrom ?? null,
    dateTo: filter.dateTo ?? null,
  };

  return { whereClause: conditions.join(" AND "), replacements };
};

const getReceivablesList = async (
  filter: ReceivableListFilter
): Promise<PaginatedResult<ReceivableListItem> & { summary: ReceivableSummary }> => {
  const { whereClause, replacements } = buildWhere(filter);

  const [summaryRow] = (await DataBase.instance.sequelize.query(
    `SELECT COUNT(*) AS total, COALESCE(SUM(q.total - q.total_paid), 0) AS total_balance
     FROM quotation q
     INNER JOIN client c ON c.id = q.client_id
     WHERE ${whereClause}`,
    { type: QueryTypes.SELECT, replacements }
  )) as { total: number; total_balance: string }[];

  // El último pago sale de una subconsulta agrupada (un solo JOIN), nunca
  // una consulta por fila (N+1).
  const rows = (await DataBase.instance.sequelize.query(
    `SELECT q.id AS quotation_id, c.id AS client_id, c.name AS client_name, q.status, q.total, q.total_paid,
            (q.total - q.total_paid) AS balance, q.business_unit_id, q.created_at, lp.last_paid_at
     FROM quotation q
     INNER JOIN client c ON c.id = q.client_id
     LEFT JOIN (
       SELECT quotation_id, MAX(paid_at) AS last_paid_at
       FROM quotation_payment
       WHERE is_deleted = false
       GROUP BY quotation_id
     ) lp ON lp.quotation_id = q.id
     WHERE ${whereClause}
     ORDER BY ${ORDER_COLUMN[filter.orderBy]} ${filter.orderDir === "desc" ? "DESC" : "ASC"}, q.id ASC
     LIMIT :limit OFFSET :offset`,
    {
      type: QueryTypes.SELECT,
      replacements: { ...replacements, limit: filter.limit, offset: (filter.page - 1) * filter.limit },
    }
  )) as RawReceivableRow[];

  const data: ReceivableListItem[] = rows.map((row) => ({
    quotation_id: row.quotation_id,
    client_id: row.client_id,
    client_name: row.client_name,
    status: row.status,
    total: Number(row.total),
    total_paid: Number(row.total_paid),
    balance: Number(Number(row.balance).toFixed(2)),
    business_unit_id: row.business_unit_id,
    created_at: new Date(row.created_at).toISOString(),
    last_paid_at: row.last_paid_at,
  }));

  return {
    data,
    meta: buildPaginationMeta(Number(summaryRow?.total ?? 0), filter.page, filter.limit),
    summary: {
      total_balance: Number(Number(summaryRow?.total_balance ?? 0).toFixed(2)),
      quotation_count: Number(summaryRow?.total ?? 0),
    },
  };
};

export { getReceivablesList };

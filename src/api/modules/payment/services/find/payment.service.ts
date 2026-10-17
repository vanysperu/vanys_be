import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";
import { buildPaginationMeta, PaginatedResult } from "../../../../../core/utils/paginate";

// Un pago vive físicamente en quotation_payment (CLAUDE.md: no duplicar
// tablas para la misma entidad) — este módulo solo agrega la capa RBAC de
// listar/editar/anular que faltaba. company_id/business_unit_id se derivan
// siempre de la cotización dueña del pago, nunca se guardan sueltos acá.
export interface PaymentListItem {
  id: number;
  quotation_id: number;
  client_name: string;
  amount: number;
  method: string | null;
  paid_at: string;
  notes: string | null;
  operation_number: string | null;
  is_deleted: boolean;
  business_unit_id: number | null;
  created_at: string;
}

export interface PaymentListFilter {
  // null = is_system (ve todo).
  companyId: number | null;
  businessUnitId?: number;
  quotationId?: number;
  method?: string;
  dateFrom?: string;
  dateTo?: string;
  includeDisabled?: boolean;
  page: number;
  limit: number;
}

interface RawPaymentRow {
  id: number;
  quotation_id: number;
  client_name: string;
  amount: string;
  method: string | null;
  paid_at: string;
  notes: string | null;
  operation_number: string | null;
  is_deleted: number | boolean;
  business_unit_id: number | null;
  created_at: Date;
}

const getPaymentsList = async (filter: PaymentListFilter): Promise<PaginatedResult<PaymentListItem>> => {
  const conditions: string[] = ["(:companyId IS NULL OR q.company_id = :companyId)"];
  if (filter.businessUnitId !== undefined) conditions.push("q.business_unit_id = :businessUnitId");
  if (filter.quotationId !== undefined) conditions.push("qp.quotation_id = :quotationId");
  if (filter.method) conditions.push("qp.method = :method");
  if (filter.dateFrom) conditions.push("qp.paid_at >= :dateFrom");
  if (filter.dateTo) conditions.push("qp.paid_at <= :dateTo");
  if (!filter.includeDisabled) conditions.push("qp.is_deleted = false");

  const replacements = {
    companyId: filter.companyId,
    businessUnitId: filter.businessUnitId ?? null,
    quotationId: filter.quotationId ?? null,
    method: filter.method ?? null,
    dateFrom: filter.dateFrom ?? null,
    dateTo: filter.dateTo ?? null,
  };

  const whereClause = conditions.join(" AND ");

  const [countRow] = (await DataBase.instance.sequelize.query(
    `SELECT COUNT(*) AS total
     FROM quotation_payment qp
     INNER JOIN quotation q ON q.id = qp.quotation_id
     WHERE ${whereClause}`,
    { type: QueryTypes.SELECT, replacements }
  )) as { total: number }[];

  const rows = (await DataBase.instance.sequelize.query(
    `SELECT qp.id, qp.quotation_id, c.name AS client_name, qp.amount, qp.method, qp.paid_at, qp.notes,
            qp.operation_number, qp.is_deleted, q.business_unit_id, qp.created_at
     FROM quotation_payment qp
     INNER JOIN quotation q ON q.id = qp.quotation_id
     INNER JOIN client c ON c.id = q.client_id
     WHERE ${whereClause}
     ORDER BY qp.paid_at DESC, qp.created_at DESC
     LIMIT :limit OFFSET :offset`,
    {
      type: QueryTypes.SELECT,
      replacements: { ...replacements, limit: filter.limit, offset: (filter.page - 1) * filter.limit },
    }
  )) as RawPaymentRow[];

  const data: PaymentListItem[] = rows.map((row) => ({
    id: row.id,
    quotation_id: row.quotation_id,
    client_name: row.client_name,
    amount: Number(row.amount),
    method: row.method,
    paid_at: row.paid_at,
    notes: row.notes,
    operation_number: row.operation_number,
    is_deleted: Boolean(row.is_deleted),
    business_unit_id: row.business_unit_id,
    created_at: new Date(row.created_at).toISOString(),
  }));

  return { data, meta: buildPaginationMeta(Number(countRow?.total ?? 0), filter.page, filter.limit) };
};

export { getPaymentsList };

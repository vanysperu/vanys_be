import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";
import { buildPaginationMeta, PaginatedResult } from "../../../../../core/utils/paginate";
import { correctionsCountSql } from "../../../money_correction/services/shared/corrections_count";

// Historial de reposiciones de un trabajador (o de todos): cuánto, cuándo,
// desde qué cuenta, quién lo registró y si se anuló.
export interface EmployeeDebtPaymentListItem {
  id: number;
  company_id: number;
  user_id: number;
  employee_name: string;
  amount: number;
  paid_at: string;
  payment_account_id: number | null;
  payment_account_name: string | null;
  operation_number: string | null;
  is_deleted: boolean;
  registered_by_name: string | null;
  // Instante UTC (ISO) en que se registró; si está anulada, updated_at es
  // cuándo se anuló.
  created_at: string;
  updated_at: string | null;
  // Cuántas correcciones tiene (badge "Corregido (n)"), en la misma consulta.
  corrections_count: number;
}

export interface EmployeeDebtPaymentListFilter {
  // null = Super Administrador (todas las empresas).
  companyId: number | null;
  userId?: number;
  page: number;
  limit: number;
}

interface RawPaymentRow {
  id: number;
  company_id: number;
  user_id: number;
  employee_name: string;
  amount: string;
  paid_at: string;
  payment_account_id: number | null;
  payment_account_name: string | null;
  operation_number: string | null;
  is_deleted: number;
  registered_by_name: string | null;
  created_at: Date;
  updated_at: Date | null;
  corrections_count: number | string | null;
}

const getEmployeeDebtPayments = async (
  filter: EmployeeDebtPaymentListFilter
): Promise<PaginatedResult<EmployeeDebtPaymentListItem>> => {
  const where = `
    WHERE (:companyId IS NULL OR p.company_id = :companyId)
      AND (:userId IS NULL OR p.user_id = :userId)`;
  const replacements = { companyId: filter.companyId, userId: filter.userId ?? null };

  const [countRow] = (await DataBase.instance.sequelize.query(
    `SELECT COUNT(*) AS total FROM employee_debt_payment p ${where}`,
    { type: QueryTypes.SELECT, replacements }
  )) as { total: number }[];

  const rows = (await DataBase.instance.sequelize.query(
    `SELECT p.id, p.company_id, p.user_id, CONCAT(u.name, ' ', u.paternal_lastname) AS employee_name,
            p.amount, p.paid_at, p.payment_account_id, pa.name AS payment_account_name, p.operation_number, p.is_deleted,
            CONCAT(actor.name, ' ', actor.paternal_lastname) AS registered_by_name, p.created_at, p.updated_at,
            ${correctionsCountSql("employee_debt_payment", "p.id")} AS corrections_count
     FROM employee_debt_payment p
     INNER JOIN user u ON u.id = p.user_id
     LEFT JOIN user actor ON actor.id = p.created_by
     LEFT JOIN general_variable pa ON pa.id = p.payment_account_id
     ${where}
     ORDER BY p.paid_at DESC, p.id DESC
     LIMIT :limit OFFSET :offset`,
    {
      type: QueryTypes.SELECT,
      replacements: { ...replacements, limit: filter.limit, offset: (filter.page - 1) * filter.limit },
    }
  )) as RawPaymentRow[];

  const data = rows.map((row) => ({
    id: row.id,
    company_id: row.company_id,
    user_id: row.user_id,
    employee_name: row.employee_name,
    amount: Number(row.amount),
    paid_at: row.paid_at,
    payment_account_id: row.payment_account_id,
    payment_account_name: row.payment_account_name,
    operation_number: row.operation_number,
    is_deleted: Boolean(row.is_deleted),
    registered_by_name: row.registered_by_name,
    corrections_count: Number(row.corrections_count ?? 0),
    created_at: new Date(row.created_at).toISOString(),
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  }));

  return { data, meta: buildPaginationMeta(Number(countRow?.total ?? 0), filter.page, filter.limit) };
};

export { getEmployeeDebtPayments };

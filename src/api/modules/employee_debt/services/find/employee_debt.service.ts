import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";
import { buildPaginationMeta, PaginatedResult } from "../../../../../core/utils/paginate";

// "¿A quién se le debe y cuánto?" (pedido explícito del usuario) — se
// agrega por trabajador, nunca se expone la lista de compras sueltas acá
// (eso ya se ve en el detalle de la orden de compra que generó cada deuda).
export interface EmployeeDebtSummaryItem {
  user_id: number;
  employee_name: string;
  pending_amount: number;
  pending_count: number;
}

export interface EmployeeDebtSummaryFilter {
  companyId: number | null;
  page: number;
  limit: number;
}

interface RawSummaryRow {
  user_id: number;
  employee_name: string;
  pending_amount: string;
  pending_count: string;
}

const getEmployeeDebtSummary = async (
  filter: EmployeeDebtSummaryFilter
): Promise<PaginatedResult<EmployeeDebtSummaryItem>> => {
  const [countRow] = (await DataBase.instance.sequelize.query(
    `SELECT COUNT(DISTINCT ed.user_id) AS total
     FROM employee_debt ed
     WHERE ed.status = 'pending' AND (:companyId IS NULL OR ed.company_id = :companyId)`,
    { type: QueryTypes.SELECT, replacements: { companyId: filter.companyId } }
  )) as { total: number }[];

  const rows = (await DataBase.instance.sequelize.query(
    `SELECT ed.user_id,
            CONCAT(u.name, ' ', u.paternal_lastname) AS employee_name,
            SUM(ed.amount) AS pending_amount,
            COUNT(*) AS pending_count
     FROM employee_debt ed
     INNER JOIN user u ON u.id = ed.user_id
     WHERE ed.status = 'pending' AND (:companyId IS NULL OR ed.company_id = :companyId)
     GROUP BY ed.user_id, u.name, u.paternal_lastname
     ORDER BY pending_amount DESC
     LIMIT :limit OFFSET :offset`,
    {
      type: QueryTypes.SELECT,
      replacements: { companyId: filter.companyId, limit: filter.limit, offset: (filter.page - 1) * filter.limit },
    }
  )) as RawSummaryRow[];

  const data: EmployeeDebtSummaryItem[] = rows.map((row) => ({
    user_id: row.user_id,
    employee_name: row.employee_name,
    pending_amount: Number(row.pending_amount),
    pending_count: Number(row.pending_count),
  }));

  return { data, meta: buildPaginationMeta(Number(countRow?.total ?? 0), filter.page, filter.limit) };
};

export { getEmployeeDebtSummary };

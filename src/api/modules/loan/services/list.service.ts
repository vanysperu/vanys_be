import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../database";
import { buildPaginationMeta, getOffset, PaginatedResult } from "../../../../core/utils/paginate";
import { todayInBusinessTz } from "../../../../utils/dateUtils";
import { roundMoney } from "../../../../utils/numbers";
import { LoanDto, LoanListParams, LoanListSummary } from "../types/loan.types";
import { LOAN_SELECT_SQL, LoanRow, toLoanDto } from "./shared/loan_shared";

// Saldo de un préstamo en SQL (mismo cálculo que toLoanDto).
const BALANCE_SQL = "(l.total_due - COALESCE(p.paid_amount, 0))";

// Condición del filtro de estado (texto fijo del código, nunca del usuario).
const STATUS_SQL: Record<string, string> = {
  pending: `l.active = 1 AND ${BALANCE_SQL} > 0`,
  overdue: `l.active = 1 AND ${BALANCE_SQL} > 0 AND l.due_date < :today`,
  paid: `l.active = 1 AND ${BALANCE_SQL} <= 0`,
  annulled: "l.active = 0",
};

/**
 * Préstamos paginados en la base (CLAUDE.md §4), del más reciente al más
 * viejo, con lo cobrado y el saldo de cada uno. Sin filtro de estado se
 * listan los vigentes (no los anulados). El resumen (saldo por cobrar e
 * interés cobrado) es de TODO lo filtrado, no solo de la página.
 */
export async function listLoansService(params: LoanListParams): Promise<PaginatedResult<LoanDto> & { summary: LoanListSummary }> {
  const conditions = [
    "(:companyId IS NULL OR l.company_id = :companyId)",
    "(:businessUnitId IS NULL OR l.business_unit_id = :businessUnitId)",
    "(:search IS NULL OR l.borrower_name LIKE :search OR l.borrower_document LIKE :search)",
    "(:dateFrom IS NULL OR l.loaned_at >= :dateFrom)",
    "(:dateTo IS NULL OR l.loaned_at <= :dateTo)",
    params.status ? STATUS_SQL[params.status] : "l.active = 1",
  ];
  const where = `WHERE ${conditions.join(" AND ")}`;
  const replacements = {
    companyId: params.companyId,
    businessUnitId: params.businessUnitId ?? null,
    search: params.search ? `%${params.search}%` : null,
    dateFrom: params.dateFrom ?? null,
    dateTo: params.dateTo ?? null,
    today: todayInBusinessTz(),
    limit: params.limit,
    offset: getOffset(params.page, params.limit),
  };
  const fromSql = LOAN_SELECT_SQL.slice(LOAN_SELECT_SQL.indexOf("FROM loan l"));

  const [rows, totals] = await Promise.all([
    DataBase.instance.sequelize.query(`${LOAN_SELECT_SQL} ${where} ORDER BY l.loaned_at DESC, l.id DESC LIMIT :limit OFFSET :offset`, {
      type: QueryTypes.SELECT,
      replacements,
    }) as Promise<LoanRow[]>,
    DataBase.instance.sequelize.query(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN l.active = 1 AND ${BALANCE_SQL} > 0 THEN ${BALANCE_SQL} ELSE 0 END), 0) AS outstanding_balance,
              COALESCE(SUM(CASE WHEN l.active = 1 THEN COALESCE(p.paid_interest, 0) ELSE 0 END), 0) AS interest_collected
       ${fromSql} ${where}`,
      { type: QueryTypes.SELECT, replacements }
    ) as Promise<{ total: unknown; outstanding_balance: unknown; interest_collected: unknown }[]>,
  ]);

  const summaryRow = totals[0];
  return {
    data: rows.map(toLoanDto),
    meta: buildPaginationMeta(Number(summaryRow?.total ?? 0), params.page, params.limit),
    summary: {
      outstanding_balance: roundMoney(Number(summaryRow?.outstanding_balance ?? 0)),
      interest_collected: roundMoney(Number(summaryRow?.interest_collected ?? 0)),
    },
  };
}

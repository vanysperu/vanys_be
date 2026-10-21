import { QUOTATION_STATUSES, QuotationStatus } from "../../../quotation/model/quotation.model";
import { StatisticsPeriod, StatisticsScope, StatusBreakdownItem } from "../../types/statistics.types";
import { EMISSION_DATE_SQL, QUOTATION_SCOPE_SQL, scopeReplacements, selectRows, toCount, toMoney } from "../shared/scope";

interface StatusRow {
  status: QuotationStatus;
  count: unknown;
  amount: unknown;
}

// En qué quedaron las cotizaciones emitidas en el periodo: cuántas (y por
// cuánto) hay en cada estado. Devuelve todos los estados, aunque estén en 0,
// en el orden del flujo.
export async function getStatusBreakdownService(
  scope: StatisticsScope,
  period: StatisticsPeriod
): Promise<StatusBreakdownItem[]> {
  const rows = await selectRows<StatusRow>(
    `SELECT q.status, COUNT(*) AS count, COALESCE(SUM(q.total), 0) AS amount
     FROM quotation q
     WHERE ${QUOTATION_SCOPE_SQL} AND ${EMISSION_DATE_SQL} BETWEEN :from AND :to
     GROUP BY q.status`,
    { ...scopeReplacements(scope), from: period.date_from, to: period.date_to }
  );

  const byStatus = new Map(rows.map((row) => [row.status, row]));
  return QUOTATION_STATUSES.map((status) => ({
    status,
    count: toCount(byStatus.get(status)?.count),
    amount: toMoney(byStatus.get(status)?.amount),
  }));
}

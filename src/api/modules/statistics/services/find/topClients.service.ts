import { StatisticsPeriod, StatisticsScope, TopClientItem } from "../../types/statistics.types";
import { EMISSION_DATE_SQL, QUOTATION_SCOPE_SQL, scopeReplacements, selectRows, toCount, toMoney } from "../shared/scope";

const TOP_CLIENTS_LIMIT = 5;

interface ClientRow {
  client_id: number;
  name: string;
  amount: unknown;
  count: unknown;
}

// Los clientes que más compraron: monto de sus cotizaciones ganadas
// emitidas en el periodo.
export async function getTopClientsService(scope: StatisticsScope, period: StatisticsPeriod): Promise<TopClientItem[]> {
  const rows = await selectRows<ClientRow>(
    `SELECT c.id AS client_id, c.name, COALESCE(SUM(q.total), 0) AS amount, COUNT(*) AS count
     FROM quotation q
     INNER JOIN client c ON c.id = q.client_id
     WHERE ${QUOTATION_SCOPE_SQL} AND q.status IN (:won) AND ${EMISSION_DATE_SQL} BETWEEN :from AND :to
     GROUP BY c.id, c.name
     ORDER BY amount DESC, c.name ASC
     LIMIT :limit`,
    { ...scopeReplacements(scope), from: period.date_from, to: period.date_to, limit: TOP_CLIENTS_LIMIT }
  );

  return rows.map((row) => ({
    client_id: row.client_id,
    name: row.name,
    amount: toMoney(row.amount),
    count: toCount(row.count),
  }));
}

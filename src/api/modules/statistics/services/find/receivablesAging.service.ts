import { todayInBusinessTz } from "../../../../../utils/dateUtils";
import { RECEIVABLE_MIN_BALANCE, RECEIVABLE_STATUSES } from "../../../receivable/services/find/receivable.service";
import { AgingBucket, AgingItem, StatisticsScope } from "../../types/statistics.types";
import { EMISSION_DATE_SQL, QUOTATION_SCOPE_SQL, scopeReplacements, selectRows, toCount, toMoney } from "../shared/scope";

const AGING_BUCKETS: AgingBucket[] = ["0-30", "31-60", "61-90", "91+"];

interface AgingRow {
  bucket: AgingBucket;
  amount: unknown;
  count: unknown;
}

// Saldo por cobrar HOY, por antigüedad desde la emisión: lo de +90 días es lo
// más difícil de cobrar. Mismo universo que el módulo Por cobrar (no depende
// del periodo elegido: es una foto del momento).
export async function getReceivablesAgingService(scope: StatisticsScope): Promise<AgingItem[]> {
  const rows = await selectRows<AgingRow>(
    `SELECT CASE
              WHEN aged.days <= 30 THEN '0-30'
              WHEN aged.days <= 60 THEN '31-60'
              WHEN aged.days <= 90 THEN '61-90'
              ELSE '91+'
            END AS bucket,
            COALESCE(SUM(aged.balance), 0) AS amount,
            COUNT(*) AS count
     FROM (
       SELECT DATEDIFF(:today, ${EMISSION_DATE_SQL}) AS days, (q.total - q.total_paid) AS balance
       FROM quotation q
       WHERE ${QUOTATION_SCOPE_SQL}
         AND q.status IN (:receivable)
         AND (q.total - q.total_paid) >= :minBalance
     ) aged
     GROUP BY bucket`,
    {
      ...scopeReplacements(scope),
      today: todayInBusinessTz(),
      receivable: RECEIVABLE_STATUSES,
      minBalance: RECEIVABLE_MIN_BALANCE,
    }
  );

  const byBucket = new Map(rows.map((row) => [row.bucket, row]));
  return AGING_BUCKETS.map((bucket) => ({
    bucket,
    amount: toMoney(byBucket.get(bucket)?.amount),
    count: toCount(byBucket.get(bucket)?.count),
  }));
}

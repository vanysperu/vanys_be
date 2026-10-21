import { StatisticsPeriod, StatisticsScope, TrendPoint } from "../../types/statistics.types";
import { BUCKET_SQL_FORMAT, buildBuckets } from "../shared/period";
import {
  CASH_SCOPE_SQL,
  EMISSION_DATE_SQL,
  MONEY_SCOPE_SQL,
  QUOTATION_SCOPE_SQL,
  scopeReplacements,
  selectRows,
  toMoney,
} from "../shared/scope";

interface BucketRow {
  bucket: string;
  [measure: string]: unknown;
}

// Tendencia del periodo, tramo por tramo (día o mes): cotizado vs ganado
// (por fecha de emisión) e ingresos vs egresos de caja (por fecha del
// movimiento). Cada consulta agrupa en SQL — nunca una consulta por tramo.
export async function getTrendService(scope: StatisticsScope, period: StatisticsPeriod): Promise<TrendPoint[]> {
  const replacements = {
    ...scopeReplacements(scope),
    from: period.date_from,
    to: period.date_to,
    fmt: BUCKET_SQL_FORMAT[period.granularity],
  };

  const [quotations, payments, quotationExpenses, manualCash] = await Promise.all([
    selectRows<BucketRow>(
      `SELECT DATE_FORMAT(${EMISSION_DATE_SQL}, :fmt) AS bucket,
              COALESCE(SUM(q.total), 0) AS quoted,
              COALESCE(SUM(CASE WHEN q.status IN (:won) THEN q.total ELSE 0 END), 0) AS won
       FROM quotation q
       WHERE ${QUOTATION_SCOPE_SQL} AND ${EMISSION_DATE_SQL} BETWEEN :from AND :to
       GROUP BY bucket`,
      replacements
    ),
    selectRows<BucketRow>(
      `SELECT DATE_FORMAT(qp.paid_at, :fmt) AS bucket, COALESCE(SUM(qp.amount), 0) AS amount
       FROM quotation_payment qp
       INNER JOIN quotation q ON q.id = qp.quotation_id
       WHERE qp.is_deleted = false AND ${MONEY_SCOPE_SQL} AND qp.paid_at BETWEEN :from AND :to
       GROUP BY bucket`,
      replacements
    ),
    selectRows<BucketRow>(
      `SELECT DATE_FORMAT(qe.spent_at, :fmt) AS bucket, COALESCE(SUM(qe.amount), 0) AS amount
       FROM quotation_expense qe
       INNER JOIN quotation q ON q.id = qe.quotation_id
       WHERE ${MONEY_SCOPE_SQL} AND qe.spent_at BETWEEN :from AND :to
       GROUP BY bucket`,
      replacements
    ),
    selectRows<BucketRow>(
      `SELECT DATE_FORMAT(cm.occurred_at, :fmt) AS bucket,
              COALESCE(SUM(CASE WHEN cm.direction = 'income' THEN cm.amount ELSE 0 END), 0) AS income,
              COALESCE(SUM(CASE WHEN cm.direction = 'expense' THEN cm.amount ELSE 0 END), 0) AS expense
       FROM cash_movement cm
       WHERE ${CASH_SCOPE_SQL} AND cm.occurred_at BETWEEN :from AND :to
       GROUP BY bucket`,
      replacements
    ),
  ]);

  const byBucket = (rows: BucketRow[]) => new Map(rows.map((row) => [row.bucket, row]));
  const quotationMap = byBucket(quotations);
  const paymentMap = byBucket(payments);
  const expenseMap = byBucket(quotationExpenses);
  const manualMap = byBucket(manualCash);

  return buildBuckets(period).map((bucket) => ({
    bucket,
    quoted: toMoney(quotationMap.get(bucket)?.quoted),
    won: toMoney(quotationMap.get(bucket)?.won),
    income: toMoney(toMoney(paymentMap.get(bucket)?.amount) + toMoney(manualMap.get(bucket)?.income)),
    expenses: toMoney(toMoney(expenseMap.get(bucket)?.amount) + toMoney(manualMap.get(bucket)?.expense)),
  }));
}

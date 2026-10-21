import { SellerItem, StatisticsPeriod, StatisticsScope } from "../../types/statistics.types";
import {
  EMISSION_DATE_SQL,
  MONEY_SCOPE_SQL,
  QUOTATION_SCOPE_SQL,
  ratio,
  scopeReplacements,
  selectRows,
  toCount,
  toMoney,
} from "../shared/scope";

const SELLERS_LIMIT = 20;

interface SellerRow {
  user_id: number | null;
  name: string | null;
  paternal_lastname: string | null;
  quoted_count: unknown;
  quoted_amount: unknown;
  won_count: unknown;
  won_amount: unknown;
  lost_count: unknown;
}

interface CollectedRow {
  user_id: number | null;
  collected: unknown;
}

// Rendimiento por persona que cotiza (quien creó la cotización): cuánto
// cotizó, cuánto cerró, su tasa de conversión y cuánto se cobró de lo suyo.
export async function getSellersService(scope: StatisticsScope, period: StatisticsPeriod): Promise<SellerItem[]> {
  const replacements = { ...scopeReplacements(scope), from: period.date_from, to: period.date_to, limit: SELLERS_LIMIT };

  const [sellers, collected] = await Promise.all([
    selectRows<SellerRow>(
      `SELECT q.created_by AS user_id, u.name, u.paternal_lastname,
              COUNT(*) AS quoted_count,
              COALESCE(SUM(q.total), 0) AS quoted_amount,
              COALESCE(SUM(q.status IN (:won)), 0) AS won_count,
              COALESCE(SUM(CASE WHEN q.status IN (:won) THEN q.total ELSE 0 END), 0) AS won_amount,
              COALESCE(SUM(q.status IN (:lost)), 0) AS lost_count
       FROM quotation q
       LEFT JOIN \`user\` u ON u.id = q.created_by
       WHERE ${QUOTATION_SCOPE_SQL} AND ${EMISSION_DATE_SQL} BETWEEN :from AND :to
       GROUP BY q.created_by, u.name, u.paternal_lastname
       ORDER BY won_amount DESC, quoted_amount DESC
       LIMIT :limit`,
      replacements
    ),
    // Lo cobrado en el periodo, atribuido a quien hizo la cotización.
    selectRows<CollectedRow>(
      `SELECT q.created_by AS user_id, COALESCE(SUM(qp.amount), 0) AS collected
       FROM quotation_payment qp
       INNER JOIN quotation q ON q.id = qp.quotation_id
       WHERE qp.is_deleted = false AND ${MONEY_SCOPE_SQL} AND qp.paid_at BETWEEN :from AND :to
       GROUP BY q.created_by`,
      replacements
    ),
  ]);

  const collectedByUser = new Map(collected.map((row) => [row.user_id, toMoney(row.collected)]));

  return sellers.map((row) => {
    const wonCount = toCount(row.won_count);
    const lostCount = toCount(row.lost_count);
    return {
      user_id: row.user_id,
      name: [row.name, row.paternal_lastname].filter(Boolean).join(" ") || "Sin asignar",
      quoted_count: toCount(row.quoted_count),
      quoted_amount: toMoney(row.quoted_amount),
      won_count: wonCount,
      won_amount: toMoney(row.won_amount),
      lost_count: lostCount,
      conversion_rate: ratio(wonCount, wonCount + lostCount),
      collected: collectedByUser.get(row.user_id) ?? 0,
    };
  });
}

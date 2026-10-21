import { StatisticsPeriod, StatisticsScope, TopProductItem } from "../../types/statistics.types";
import { EMISSION_DATE_SQL, QUOTATION_SCOPE_SQL, scopeReplacements, selectRows, toCount, toMoney } from "../shared/scope";

const TOP_PRODUCTS_LIMIT = 6;

interface ProductRow {
  product_id: number;
  name: string;
  amount: unknown;
  units: unknown;
}

// Los productos que más se vendieron: suma de los items de cotizaciones
// ganadas emitidas en el periodo (monto sin IGV, como en cada línea).
export async function getTopProductsService(scope: StatisticsScope, period: StatisticsPeriod): Promise<TopProductItem[]> {
  const rows = await selectRows<ProductRow>(
    `SELECT p.id AS product_id, p.name, COALESCE(SUM(qi.subtotal), 0) AS amount, COALESCE(SUM(qi.quantity), 0) AS units
     FROM quotation_item qi
     INNER JOIN quotation q ON q.id = qi.quotation_id
     INNER JOIN product p ON p.id = qi.product_id
     WHERE ${QUOTATION_SCOPE_SQL} AND q.status IN (:won) AND ${EMISSION_DATE_SQL} BETWEEN :from AND :to
     GROUP BY p.id, p.name
     ORDER BY amount DESC, p.name ASC
     LIMIT :limit`,
    { ...scopeReplacements(scope), from: period.date_from, to: period.date_to, limit: TOP_PRODUCTS_LIMIT }
  );

  return rows.map((row) => ({
    product_id: row.product_id,
    name: row.name,
    amount: toMoney(row.amount),
    units: toCount(row.units),
  }));
}

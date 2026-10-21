import { StatisticsPeriod, StatisticsScope, TopTechniqueItem } from "../../types/statistics.types";
import { EMISSION_DATE_SQL, QUOTATION_SCOPE_SQL, scopeReplacements, selectRows, toCount } from "../shared/scope";

const TOP_TECHNIQUES_LIMIT = 6;

interface TechniqueRow {
  technique_id: number;
  name: string;
  units: unknown;
  quotations: unknown;
}

// Las técnicas de personalización más pedidas: unidades personalizadas en
// cotizaciones ganadas emitidas en el periodo (los productos sin
// personalización no cuentan).
export async function getTopTechniquesService(
  scope: StatisticsScope,
  period: StatisticsPeriod
): Promise<TopTechniqueItem[]> {
  const rows = await selectRows<TechniqueRow>(
    `SELECT t.id AS technique_id, t.name, COALESCE(SUM(qi.quantity), 0) AS units, COUNT(DISTINCT q.id) AS quotations
     FROM quotation_item qi
     INNER JOIN quotation q ON q.id = qi.quotation_id
     INNER JOIN customization_technique t ON t.id = qi.technique_id
     WHERE ${QUOTATION_SCOPE_SQL} AND q.status IN (:won) AND ${EMISSION_DATE_SQL} BETWEEN :from AND :to
     GROUP BY t.id, t.name
     ORDER BY units DESC, t.name ASC
     LIMIT :limit`,
    { ...scopeReplacements(scope), from: period.date_from, to: period.date_to, limit: TOP_TECHNIQUES_LIMIT }
  );

  return rows.map((row) => ({
    technique_id: row.technique_id,
    name: row.name,
    units: toCount(row.units),
    quotations: toCount(row.quotations),
  }));
}

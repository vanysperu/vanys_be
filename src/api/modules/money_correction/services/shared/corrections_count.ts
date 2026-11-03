import { QueryTypes, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { isMoneyCorrectionSource, MoneyCorrectionSource } from "../../types/money_correction.types";

// Cuántas correcciones tiene cada fila (badge "Corregido (n)") sin N+1.

// Columna calificada simple (ej. "cm.id", "fpop.quotation_expense_id"): lo
// único que se acepta para interpolar en el SQL.
const QUALIFIED_COLUMN = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/;

/**
 * Subconsulta fija para listados en SQL crudo:
 *   (SELECT COUNT(*) FROM money_correction mc WHERE mc.source_type='…' AND mc.source_id=<col>)
 * Usa el índice (source_type, source_id, created_at). Ambos argumentos son
 * texto fijo del código; igual se validan (lista blanca) para que un valor
 * externo nunca termine interpolado en la consulta.
 */
export function correctionsCountSql(sourceType: MoneyCorrectionSource, idColumn: string): string {
  if (!isMoneyCorrectionSource(sourceType)) throw new Error(`Fuente de corrección no válida: ${String(sourceType)}`);
  if (!QUALIFIED_COLUMN.test(idColumn)) throw new Error(`Columna no válida para contar correcciones: ${idColumn}`);
  return `(SELECT COUNT(*) FROM money_correction mc WHERE mc.source_type = '${sourceType}' AND mc.source_id = ${idColumn})`;
}

/**
 * Para listados por ORM: UNA consulta agrupada con IN sobre los ids de la
 * página. Devuelve id → cantidad (los ids sin correcciones no aparecen en el
 * Map: usar `map.get(id) ?? 0`).
 */
export async function loadCorrectionCounts(
  sourceType: MoneyCorrectionSource,
  ids: readonly number[],
  transaction?: Transaction
): Promise<Map<number, number>> {
  if (ids.length === 0) return new Map();

  const rows = await DataBase.instance.sequelize.query<{ source_id: number | string; total: number | string }>(
    `SELECT source_id, COUNT(*) AS total
     FROM money_correction
     WHERE source_type = :sourceType AND source_id IN (:ids)
     GROUP BY source_id`,
    { type: QueryTypes.SELECT, replacements: { sourceType, ids: [...new Set(ids)] }, transaction }
  );

  return new Map(rows.map((row) => [Number(row.source_id), Number(row.total)]));
}

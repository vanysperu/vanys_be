// genericLister.ts

import { QueryTypes } from "sequelize";
import { DataBase } from "../../database";
import { AnyCase } from "../../types/any-case";

type F1 = "select";
type SelectKeyword = `${Uppercase<F1>} | ${Lowercase<F1>}`;
type FSelect = `${SelectKeyword} {{columns}} ${string}` | `\n${SelectKeyword} {{columns}} ${string}`;

/**
 * Estructura de una consulta con placeholders.
 *
 * @interface QueryStructure
 * @property {string} qColumns - Columnas select.
 * @property {string} fSelect - Clausula select en un formato específico.
 * @property {string} [qWhere] - Clausula where (opcional).
 * @property {string} [qGroupBy] - Clausula group by (opcional).
 * @property {string} [qOrderBy] - Clausula order by (opcional).
 * @example
 *   {
 *     qColumns: 'columna1, columna2',
 *     qSelect: 'SELECT {{columns}} FROM miTabla',
 *     qWhere: 'WHERE condicion = true'
 *   }
 */
export interface QueryStructure {
  qColumns: string;
  qSelect: string;
  qWhere?: string;
  qGroupBy?: string;
  qOrderBy?: string;
}

/**
 * Opciones para una consulta paginada.
 *
 * @interface QueryOptions
 * @template T - Tipo de datos de las filas resultantes.
 * @property {QueryStructure} structure - Estructura de la consulta.
 * @property {any} [replacements] - Reemplazos de placeholders (opcional).
 * @property {number} [page] - Número de página (opcional).
 * @property {number} [limit] - Límite de resultados por página (opcional).
 */
export interface QueryOptions<T> {
  structure: QueryStructure;
  replacements?: Record<string, unknown> | unknown[];
  page?: number;
  limit?: number;
}

/**
 * Valida si una cadena cumple con el formato de consulta especificado.
 *
 * @param {string} qSelect - Cadena de consulta.
 * @returns {boolean} Verdadero si es válido, falso si no.
 */
function isValidFSelect(qSelect: string): boolean {
  const regex = /^\s*select\s*{{columns}}\s*from\s*/i;
  return regex.test(qSelect);
}

/**
 * Construye una cláusula de paginación para una consulta SQL.
 *
 * @param {number} [page] - Número de página (opcional).
 * @param {number} [limit] - Límite de resultados por página (opcional).
 * @returns {string} Cláusula de paginación.
 */
function buildPagination(page?: number, limit?: number): string {
  if (!page && !limit) return "";

  if (limit && !page) {
    return `LIMIT ${limit}`;
  }

  if (page && limit) {
    const offset = (page - 1) * limit;
    return `LIMIT ${offset}, ${limit}`;
  }

  return "";
}

/**
 * Construye una consulta para obtener el recuento total de resultados.
 *
 * @param {string} baseQuery - Consulta base.
 * @param {string} otherClause - Otras clausulas.
 * @returns {string} Consulta para obtener el recuento total.
 */
// function buildTotalCountQuery(baseQuery: string, otherClause: string): string {
//   return `${baseQuery.replace("{{columns}}", "COUNT(1) as total")} ${otherClause}`;
// }
function buildTotalCountQuery(baseQuery: string, otherClause: string): string {
  // Asegura que haya un SELECT válido
  const cleanQuery = baseQuery.replace("{{columns}}", "1"); // usar "1" para no depender de columnas reales
  return `
    SELECT COUNT(*) as total
    FROM (
      ${cleanQuery} ${otherClause}
    ) as subquery
  `;
}

/**
 * Genera una lista paginada de resultados de una consulta SQL.
 *
 * @template T - Tipo de datos de las filas resultantes.
 * @param {QueryOptions<T>} options - Opciones de la consulta.
 * @returns {Promise<{ page?: number; count: number; rows: T[]; limit?: number }>} Resultados paginados.
 * @throws {Error} Si el formato de consulta no es válido.
 */
export const paginatedListGenerator = async <T = any>(
  options: QueryOptions<T>
): Promise<{ page?: number; totalCount: number; data: T[]; pageSize?: number }> => {
  const {
    structure: { qColumns, qSelect, qWhere, qOrderBy, qGroupBy },
    replacements,
    page,
    limit,
  } = options;

  const fSelect: string = qSelect + " ";

  if (!isValidFSelect(fSelect)) {
    throw new Error("Formato inválido. Debe contener 'select' seguido de '{{columns}}' y 'from'.");
  }

  const pagination = buildPagination(page, limit);

  const query = `${fSelect.replace("{{columns}}", qColumns)} ${qWhere || ""} ${qGroupBy || ""} ${
    qOrderBy || ""
  } ${pagination}`;

  const rows = (await DataBase.instance.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: replacements,
    logging: true,
  })) as T[];

  const queryCount = buildTotalCountQuery(fSelect, `${qWhere || ""} ${qGroupBy || ""}`);

  const respTotal = (await DataBase.instance.sequelize.query(queryCount, {
    type: QueryTypes.SELECT,
    replacements: replacements,
  })) as { total: number }[];

  const total = respTotal[0]?.total || 0;

  return { page, totalCount: total, data: rows, pageSize: limit };
};

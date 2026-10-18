import { Op } from "sequelize";

// Helpers compartidos por los listados (filtros que reciben todas las
// listas igual, CLAUDE.md sección 4/7).

const ACTIVE_VALUES = new Set(["active", "activo", "activa"]);
const INACTIVE_VALUES = new Set(["inactive", "inactivo", "inactiva"]);

/**
 * Filtro de "Estado" de los catálogos (columna is_deleted).
 *
 * Recibe lo que manda la tabla: "active", "inactive" o ambos separados por
 * coma (filtro de selección múltiple). Devuelve el valor de is_deleted a
 * filtrar, o undefined si no hay que filtrar (ninguno o ambos elegidos).
 *
 * Antes cada listado hacía `is_deleted = (status === "inactive")`: cualquier
 * otro texto (incluido "inactivo" o "active,inactive") mostraba solo los
 * activos, así que el filtro parecía no funcionar.
 */
export const resolveIsDeletedFilter = (raw: unknown): boolean | undefined => {
  if (raw === undefined || raw === null) return undefined;
  const values = String(raw)
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const wantsActive = values.some((value) => ACTIVE_VALUES.has(value));
  const wantsInactive = values.some((value) => INACTIVE_VALUES.has(value));
  if (wantsActive === wantsInactive) return undefined;
  return wantsInactive;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Offset fijo de Lima (sin horario de verano): los días del filtro son días
// calendario de Lima, y los DATETIME se guardan en UTC.
const BUSINESS_UTC_OFFSET = "-05:00";

/**
 * Condición para filtrar una columna DATETIME (ej. created_at) por días
 * calendario de Lima, ambos extremos incluidos: "del 17 al 18" va desde el 17
 * a las 00:00 hasta el 18 a las 23:59:59.999, hora de Lima.
 *
 * Se arma como un rango de instantes (no con DATE(...) sobre la columna) para
 * que MySQL pueda usar el índice de created_at.
 */
export const buildBusinessDateRange = (dateFrom: unknown, dateTo: unknown) => {
  const from = typeof dateFrom === "string" && ISO_DATE.test(dateFrom) ? dateFrom : undefined;
  const to = typeof dateTo === "string" && ISO_DATE.test(dateTo) ? dateTo : undefined;
  if (!from && !to) return undefined;

  return {
    ...(from ? { [Op.gte]: new Date(`${from}T00:00:00.000${BUSINESS_UTC_OFFSET}`) } : {}),
    ...(to ? { [Op.lte]: new Date(`${to}T23:59:59.999${BUSINESS_UTC_OFFSET}`) } : {}),
  };
};

// Valida un "YYYY-MM-DD" que llega por query string.
export const parseIsoDateParam = (raw: unknown): string | undefined =>
  typeof raw === "string" && ISO_DATE.test(raw) ? raw : undefined;

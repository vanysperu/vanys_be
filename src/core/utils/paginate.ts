export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

// Arma el bloque `meta` estándar de toda respuesta paginada (CLAUDE.md
// sección 4) a partir del total real de filas devuelto por
// `findAndCountAll`, nunca contando en memoria.
export function buildPaginationMeta(total: number, page: number, limit: number): PaginationMeta {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

// Calcula el offset de Sequelize a partir de page/limit ya validados por
// `paginationSchema` (page/limit siempre >= 1 acá).
export function getOffset(page: number, limit: number): number {
  return (page - 1) * limit;
}

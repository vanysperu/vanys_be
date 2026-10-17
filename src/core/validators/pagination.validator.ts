// Validador reusable de paginación para TODO endpoint de listado
// (CLAUDE.md sección 4). El proyecto usa express-validator/joi para el
// body de los endpoints, no zod (no está instalado); acá se resuelve con
// una función pura equivalente, un solo lugar con las mismas reglas
// (page min 1, limit 1-100, orderBy/orderDir con default) para que ningún
// controller repita esta lógica a mano.
export interface PaginationParams {
  page: number;
  limit: number;
  orderBy: string;
  orderDir: "asc" | "desc";
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DEFAULT_ORDER_BY = "created_at";
const DEFAULT_ORDER_DIR: "asc" | "desc" = "desc";

const toPositiveInt = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
};

// Recibe `req.query` (o cualquier objeto con claves sueltas) y devuelve
// siempre los 4 campos ya validados/con default, nunca `undefined`.
export function parsePaginationParams(query: Record<string, unknown>): PaginationParams {
  const page = toPositiveInt(query.page, DEFAULT_PAGE);
  const limitRaw = toPositiveInt(query.limit, DEFAULT_LIMIT);
  const limit = Math.min(limitRaw, MAX_LIMIT);
  const orderBy = typeof query.orderBy === "string" && query.orderBy.trim() ? query.orderBy : DEFAULT_ORDER_BY;
  const orderDirRaw = typeof query.orderDir === "string" ? query.orderDir.toLowerCase() : "";
  const orderDir: "asc" | "desc" = orderDirRaw === "asc" || orderDirRaw === "desc" ? orderDirRaw : DEFAULT_ORDER_DIR;

  return { page, limit, orderBy, orderDir };
}

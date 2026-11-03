import { Request, Response, NextFunction } from "express";
import { DatabaseError, ValidationError } from "sequelize";
import { AppError } from "../errors/AppError";
import { fail } from "../utils/response";

// MySQL/MariaDB: 1213 = ER_LOCK_DEADLOCK, 1205 = ER_LOCK_WAIT_TIMEOUT. En ambos
// casos InnoDB ya revirtió la sentencia (deadlock: la transacción entera) y
// la operación se puede reintentar sin riesgo: no es un error de datos.
const CONCURRENCY_ERRNOS: ReadonlySet<number> = new Set([1213, 1205]);

// errno del error crudo del driver (Sequelize lo deja en parent / original).
const driverErrno = (err: DatabaseError): number | undefined => {
  const candidates: unknown[] = [err.parent, err.original];
  for (const candidate of candidates) {
    if (typeof candidate !== "object" || candidate === null || !("errno" in candidate)) continue;
    const { errno } = candidate as { errno: unknown };
    if (typeof errno === "number") return errno;
  }
  return undefined;
};

// Único middleware de errores de toda la app (CLAUDE.md sección 5): se
// monta UNA sola vez, al final del pipeline de Express, después de montar
// todos los routers. Ningún controller/service responde un error a mano.
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (err instanceof AppError) {
    return fail(res, err.status, err.message, err.errors, err.code);
  }

  // Traducimos errores conocidos de Sequelize a mensajes en español pensados
  // para el usuario, sin exponer el detalle crudo de la base de datos.
  if (err instanceof ValidationError) {
    return fail(res, 400, "Los datos ingresados no son válidos.", undefined, "VALIDATION_ERROR");
  }

  // Deadlock / espera de lock agotada: dos operaciones tocaron las mismas filas
  // a la vez (ej. una corrección y un cierre de caja). 409 reintentable.
  if (err instanceof DatabaseError && CONCURRENCY_ERRNOS.has(driverErrno(err) ?? 0)) {
    console.warn("[ConcurrentUpdate]", req.method, req.originalUrl, "errno", driverErrno(err), err.message);
    return fail(
      res,
      409,
      "Otra operación modificó estos datos al mismo tiempo. Inténtalo de nuevo.",
      undefined,
      "CONCURRENT_UPDATE"
    );
  }

  if (err instanceof DatabaseError) {
    console.error("[DatabaseError]", err);
    return fail(res, 400, "No se pudo guardar la información: revisa los datos ingresados.", undefined, "DATABASE_ERROR");
  }

  // Error no controlado: se loguea completo pero nunca se filtra el detalle
  // interno al cliente.
  console.error("[UnhandledError]", err);
  return fail(res, 500, "Ocurrió un error inesperado. Intenta nuevamente.", undefined, "INTERNAL_ERROR");
}

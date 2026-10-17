import { Request, Response, NextFunction } from "express";
import { DatabaseError, ValidationError } from "sequelize";
import { AppError } from "../errors/AppError";
import { fail } from "../utils/response";

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

  if (err instanceof DatabaseError) {
    console.error("[DatabaseError]", err);
    return fail(res, 400, "No se pudo guardar la información: revisa los datos ingresados.", undefined, "DATABASE_ERROR");
  }

  // Error no controlado: se loguea completo pero nunca se filtra el detalle
  // interno al cliente.
  console.error("[UnhandledError]", err);
  return fail(res, 500, "Ocurrió un error inesperado. Intenta nuevamente.", undefined, "INTERNAL_ERROR");
}

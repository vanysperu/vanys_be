import { NextFunction } from "express";
import { DatabaseError, ValidationError } from "sequelize";
import { AppError } from "../../core/errors/AppError";

// Único lugar donde un error interno se traduce a lo que ve el cliente
// (CLAUDE.md sección 5): nunca se reenvía el mensaje crudo de Sequelize/
// MySQL (queda en inglés y expone detalles internos, ej. "Data too long
// for column 'description' at row 1") — solo mensajes en español pensados
// para el usuario. El error real completo se loguea aparte para poder
// investigarlo. Siempre delega en el errorHandler central vía `next`.
export const errorControl = (err: unknown, next: NextFunction) => {
  if (err instanceof AppError) {
    return next(err);
  }

  if (err instanceof ValidationError) {
    return next(new AppError(400, "Los datos ingresados no son válidos.", undefined, "VALIDATION_ERROR"));
  }

  if (err instanceof DatabaseError) {
    console.error("[DatabaseError]", err);
    return next(new AppError(400, "No se pudo guardar la información: revisa los datos ingresados.", undefined, "DATABASE_ERROR"));
  }

  console.error("[UnhandledError]", err);
  next(new AppError(500, "Ocurrió un error inesperado. Intenta nuevamente.", undefined, "INTERNAL_ERROR"));
};

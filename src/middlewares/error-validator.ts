import { validationResult } from "express-validator";
import { Request, Response, NextFunction } from "express";
import { AppError } from "../core/errors/AppError";

export const allValidator = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    // El mensaje ahora ES el error específico (ej. "El DNI debe tener 8
    // dígitos."), no un genérico "Validación fallida" — antes el frontend
    // solo mostraba `message` y el detalle real quedaba enterrado en
    // `errors`, invisible para el usuario (bug reportado: "sale validación
    // fallida pero no muestra el mensaje del error"). `errors` sigue
    // llevando la lista completa por si alguna pantalla quiere mostrarlos
    // todos.
    const firstMessage = errors.array()[0]?.msg ?? "Validación fallida";
    return next(new AppError(400, firstMessage, errors.array(), "VALIDATION_ERROR"));
  }

  next();
};

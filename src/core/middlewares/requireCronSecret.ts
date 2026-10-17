import { createHash, timingSafeEqual } from "crypto";
import { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError";

export const CRON_SECRET_HEADER = "x-cron-secret";

// Se comparan los hashes (mismo largo siempre) con timingSafeEqual, para
// que el tiempo de respuesta no revele cuántos caracteres del secreto
// coinciden.
const digest = (value: string): Buffer => createHash("sha256").update(value).digest();

// Protege los endpoints que dispara el cron del hosting (no un usuario):
// no usan sesión ni RBAC, sino un secreto compartido en la cabecera
// X-Cron-Secret. Va por cabecera y no por query string a propósito: la URL
// completa queda en los logs de acceso (morgan "combined") y el secreto
// quedaría expuesto ahí. Si CRON_SECRET no está configurado, el endpoint
// queda deshabilitado (404), nunca abierto.
export function requireCronSecret(req: Request, _res: Response, next: NextFunction) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return next(new AppError(404, "No encontrado", undefined, "NOT_FOUND"));

  const received = req.header(CRON_SECRET_HEADER) ?? "";
  if (!timingSafeEqual(digest(received), digest(expected))) {
    return next(new AppError(401, "No autorizado", undefined, "UNAUTHORIZED"));
  }

  return next();
}

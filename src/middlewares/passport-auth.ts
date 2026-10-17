import { NextFunction, Request, Response } from "express";
import passport from "passport";
import { CustomPassportError } from "./passport";
import { AppError } from "../core/errors/AppError";

// Motivos de rechazo de la estrategia JWT que corresponden a "no hay una
// sesión válida" (401). Cualquier otro es un fallo interno (500).
const UNAUTHENTICATED_REASONS = new Set<string>([
  "TokenNotFound",
  "TokenExpired",
  "RolesNotFound",
  "RolesOrRoutesNotFound",
  "AccountDisabled",
]);

const isPassportError = (err: unknown): err is CustomPassportError =>
  typeof err === "object" && err !== null && (err as CustomPassportError).source === "Passport";

// Autenticación JWT con el formato de error estándar de la API (CLAUDE.md
// sección 5): todo rechazo pasa por el errorHandler central como
// { success: false, message, code }.
//
// Antes se usaba passport.authenticate a secas: cuando el request venía SIN
// token, o con uno de firma inválida (ej. después de rotar
// SECRET_HIDDEN_KEY), passport respondía por su cuenta un "Unauthorized" en
// texto plano, y los rechazos propios de la estrategia salían como
// { message, reason, source } — dos formatos distintos al resto de la API.
// El motivo concreto (TokenExpired, AccountDisabled...) se conserva en `code`.
export const authenticateJwt = (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate("jwt", { session: false }, (err: unknown, user: Express.User | false) => {
    if (isPassportError(err)) {
      const status = UNAUTHENTICATED_REASONS.has(err.reason) ? 401 : 500;
      return next(new AppError(status, err.message, undefined, err.reason));
    }
    if (err) return next(err);
    if (!user) {
      return next(new AppError(401, "Tu sesión no es válida o expiró. Inicia sesión nuevamente.", undefined, "UNAUTHENTICATED"));
    }

    req.user = user;
    return next();
  })(req, res, next);
};

import { NextFunction, Request, Response } from "express";
import { IToken } from "../api/interfaces/IToken.interface";
import { AppError } from "../core/errors/AppError";

// Rutas que un usuario con contraseña temporal SÍ puede llamar antes de
// cambiarla — todo lo demás queda bloqueado por este middleware, sin
// importar qué módulos/recursos tenga otorgados su rol.
const ALLOWED_ROUTES: { route: string; verb: string }[] = [
  { route: "/user/change/password", verb: "PATCH" },
  { route: "/signout", verb: "POST" },
];

/**
 * Bloquea cualquier request que no sea "cambiar mi contraseña" o "cerrar
 * sesión" mientras el usuario tenga una contraseña temporal pendiente de
 * cambio (ver user.must_change_password). Va justo después de
 * passport.authenticate, antes de los routers de módulos — así ningún
 * endpoint queda accesible por error de configuración de RBAC.
 */
export function requirePasswordChanged(req: Request, res: Response, next: NextFunction) {
  const user = req?.user as IToken;

  if (!user?.mustChangePassword) return next();

  const currentRoute = (req.originalUrl.split("?")[0] ?? "").replace("/api", "");
  const currentMethod = req.method.toUpperCase();

  const isAllowed = ALLOWED_ROUTES.some(
    (allowed) => allowed.route === currentRoute && allowed.verb === currentMethod
  );

  if (!isAllowed) {
    // Código estable para que el frontend pueda reaccionar (redirigir a
    // /change-password) sin tener que adivinar por el mensaje — antes esto
    // no tenía `code`, así que un usuario que llegaba a cualquier otra
    // pantalla con la contraseña temporal pendiente se quedaba viendo un
    // 403 repetido en cada request, sin ninguna redirección (bug reportado
    // por el usuario: "todo se queda cargando").
    return next(new AppError(403, "Debes cambiar tu contraseña temporal antes de continuar", undefined, "MUST_CHANGE_PASSWORD"));
  }

  next();
}

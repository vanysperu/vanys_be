import { NextFunction, Request, Response } from "express";
import { IToken } from "../api/interfaces/IToken.interface";
import { AppError } from "../core/errors/AppError";

function routeToRegExp(route: string) {
  // Si la ruta termina con '/', se remueve
  const cleanedRoute = route.endsWith("/") ? route.slice(0, -1) : route;

  return new RegExp("^" + cleanedRoute.split("*").join("[^/]+") + "$");
}

// Operaciones de autoservicio sobre LA PROPIA cuenta (cambiar mi contraseña,
// ver mis propios datos) — nunca deben depender de que el rol tenga
// otorgado el resource puntual (users.changePassword.endpoint/
// users.account.endpoint). Si un admin arma un rol nuevo y se olvida de
// marcar esas dos filas (fácil de olvidar, no son un módulo de negocio),
// cualquier usuario con ese rol quedaba bloqueado para siempre: ni podía
// cambiar la contraseña temporal forzada ni hacer ninguna otra cosa,
// porque requirePasswordChanged ya lo dejaba pasar pero este middleware
// lo volvía a rechazar por RBAC. Mismo criterio que requirePasswordChanged
// (middlewares/require-password-changed.ts), que ya exceptúa esta misma
// ruta por la misma razón.
const SELF_SERVICE_ROUTES: { route: string; verb: string }[] = [
  { route: "/user/change/password", verb: "PATCH" },
  { route: "/user/user-account", verb: "GET" },
];

// Misma regla que verifyAccess, para una acción SECUNDARIA dentro de otro
// endpoint (ej. registrar un adelanto al cambiar el estado de una
// cotización): el usuario debe tener otorgada también la ruta de esa acción.
export function hasRouteAccess(user: IToken, route: string, verb: string): boolean {
  return (user?.allowedRoutes || []).some(
    (allowedRoute) =>
      routeToRegExp(allowedRoute.route).test(route) && allowedRoute.verb.trim().toUpperCase() === verb.toUpperCase()
  );
}

export function verifyAccess(req: Request, res: Response, next: NextFunction) {
  const user = req?.user as IToken;

  const originalRoute = req.originalUrl;
  let currentRoute = (originalRoute.split("?")[0] ?? "").replace("/api", "");

  // Se asegura que no exista un '/' al final
  currentRoute =
    currentRoute.endsWith("/") && currentRoute !== "/"
      ? currentRoute.slice(0, -1)
      : currentRoute;

  const currentMethod = req.method.toUpperCase();

  const isSelfService = SELF_SERVICE_ROUTES.some(
    (allowed) => allowed.route === currentRoute && allowed.verb === currentMethod
  );
  if (isSelfService) return next();

  const userAllowedRoutes = user?.allowedRoutes || [];
  // Verifica si la ruta y el método actual coinciden con alguna de las rutas y métodos permitidos
  const hasAccess = userAllowedRoutes.some((allowedRoute) => {
    const routeRegExp = routeToRegExp(allowedRoute.route);
    return (
      routeRegExp.test(currentRoute) &&
      allowedRoute.verb.trim().toUpperCase() === currentMethod
    );
  });
  if (!hasAccess) {
    return next(new AppError(403, "Usted no tiene permisos para realizar la siguiente operación"));
  }

  next();
}

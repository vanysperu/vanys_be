import { NextFunction, Request, Response } from "express";
import { IToken } from "../api/interfaces/IToken.interface";
import { AppError } from "../core/errors/AppError";

/**
 * Bloquea rutas que solo puede tocar un usuario con un rol `is_system`
 * (gestión de plataforma: catálogo compartido de módulos/recursos, altas de
 * empresas/tiendas). Va después de `passport.authenticate`, que ya deja
 * `req.user.isSystem` calculado por request.
 */
export function requireSystemRole(req: Request, res: Response, next: NextFunction) {
  const user = req?.user as IToken;

  if (!user?.isSystem) {
    return next(new AppError(403, "Esta acción solo puede realizarla un administrador de plataforma"));
  }

  next();
}

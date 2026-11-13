import { NextFunction, Request, Response } from "express";
import { IToken } from "../api/interfaces/IToken.interface";
import { AppError } from "../core/errors/AppError";
import { hasCompanyFeature } from "../api/modules/company_feature/services/shared/feature_store";
import type { FeatureCode } from "../api/modules/company_feature/types/company_feature.types";

/**
 * Corta con 403 FEATURE_DISABLED si la empresa del usuario no tiene contratada
 * la funcionalidad (plan Sprint 2 §3.1). El Super Administrador pasa: actúa
 * sobre la empresa que elige, y el service valida esa empresa.
 */
export const requireCompanyFeature =
  (code: FeatureCode) =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const user = req.user as IToken;
    if (user?.isSystem) return next();
    if (!user?.companyId) return next(new AppError(403, "Esta función es solo para usuarios de una empresa"));

    try {
      const enabled = await hasCompanyFeature(user.companyId, code);
      if (!enabled) return next(new AppError(403, "Tu empresa no tiene esta función habilitada", undefined, "FEATURE_DISABLED"));
      next();
    } catch (error: unknown) {
      // Middleware async fuera de asyncHandler: el error va al errorHandler central.
      next(error);
    }
  };

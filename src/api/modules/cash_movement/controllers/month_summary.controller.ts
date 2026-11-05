import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { resolveListCompanyFilter } from "../../../../core/rbac/companyScope";
import { resolveBusinessUnitFilter } from "../../../../core/rbac/businessUnitScope";
import { getMonthSummaryService } from "../services/find/month_summary.service";

// Mismo alcance que el listado de Caja: empresa y tienda salen de la sesión
// (el Super Administrador puede acotar con ?companyId).
export const monthSummaryController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const summary = await getMonthSummaryService(
    {
      companyId: resolveListCompanyFilter(user, req.query.companyId),
      businessUnitId: resolveBusinessUnitFilter(user) ?? null,
    },
    (req.query.period as string) || undefined
  );
  ok(res, 200, summary, "Resumen del mes obtenido correctamente");
});

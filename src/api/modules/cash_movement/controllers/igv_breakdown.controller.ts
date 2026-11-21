import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { resolveListCompanyFilter } from "../../../../core/rbac/companyScope";
import { resolveBusinessUnitFilter } from "../../../../core/rbac/businessUnitScope";
import { getIgvBreakdownService } from "../services/find/igv_breakdown.service";

// GET /cash-movement/igv-breakdown?period=YYYY-MM — "¿cómo se llegó al IGV a
// pagar?" (21-nov). Mismo alcance que el resumen del mes de Caja: empresa y
// tienda salen de la sesión (el Super Administrador puede acotar con ?companyId).
export const igvBreakdownController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const breakdown = await getIgvBreakdownService(
    {
      companyId: resolveListCompanyFilter(user, req.query.companyId),
      businessUnitId: resolveBusinessUnitFilter(user) ?? null,
    },
    (req.query.period as string) || undefined
  );
  ok(res, 200, breakdown, "Detalle del IGV obtenido correctamente");
});

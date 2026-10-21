import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { resolveBusinessUnitFilter } from "../../../../core/rbac/businessUnitScope";
import { addDaysToDateOnly, todayInBusinessTz } from "../../../../utils/dateUtils";
import { getStatisticsOverviewService } from "../services/find/overview.service";

// Periodo por defecto: los últimos 30 días (hoy incluido, hora de Lima).
const DEFAULT_RANGE_DAYS = 30;

const optionalId = (value: unknown): number | null => (Number(value) > 0 ? Number(value) : null);

// Empresa y tienda salen SIEMPRE de la sesión (CLAUDE.md secciones 10 y
// 11.1): un usuario de empresa nunca ve otra empresa (el companyId del query
// solo lo usa un Super Administrador), y uno atado a una tienda ve solo la
// suya aunque pida otra.
export const statisticsOverviewController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const today = todayInBusinessTz();
  const dateTo = (req.query.dateTo as string) || today;
  const dateFrom = (req.query.dateFrom as string) || addDaysToDateOnly(dateTo, -(DEFAULT_RANGE_DAYS - 1));

  const overview = await getStatisticsOverviewService(
    {
      companyId: user.isSystem ? optionalId(req.query.companyId) : user.companyId,
      businessUnitId: resolveBusinessUnitFilter(user) ?? optionalId(req.query.businessUnitId),
    },
    dateFrom,
    dateTo
  );

  ok(res, 200, overview, "Estadísticas obtenidas correctamente");
});

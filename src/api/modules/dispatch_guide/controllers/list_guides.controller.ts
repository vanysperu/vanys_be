import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { resolveListCompanyFilter } from "../../../../core/rbac/companyScope";
import { resolveBusinessUnitFilter } from "../../../../core/rbac/businessUnitScope";
import { parsePaginationParams } from "../../../../core/validators/pagination.validator";
import type { GuideStatus } from "../model/dispatch_guide.models";
import { listGuidesService } from "../services/guides/list_guides.service";

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);

// GET /api/dispatch-guide/guides?page=&limit=&orderBy=&orderDir=&searchTerm=&status=draft,manual&quotationId=&dateFrom=&dateTo=&companyId=
// Empresa y tienda salen de la sesión (§10, §11.1); un usuario de tienda ve las de su tienda.
export const listGuidesController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { page, limit, orderBy, orderDir } = parsePaginationParams(req.query);
  const status = text(req.query.status);
  const result = await listGuidesService({
    companyId: resolveListCompanyFilter(user, req.query.companyId),
    businessUnitId: resolveBusinessUnitFilter(user),
    page,
    limit,
    orderBy,
    orderDir,
    searchTerm: text(req.query.searchTerm),
    statuses: status ? (status.split(",") as GuideStatus[]) : undefined,
    quotationId: Number(req.query.quotationId) > 0 ? Number(req.query.quotationId) : undefined,
    dateFrom: text(req.query.dateFrom),
    dateTo: text(req.query.dateTo),
  });
  ok(res, 200, result, result.data.length === 0 ? "No hay guías" : "Guías obtenidas correctamente");
});

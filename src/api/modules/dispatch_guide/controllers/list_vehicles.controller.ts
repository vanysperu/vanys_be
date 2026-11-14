import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { resolveListCompanyFilter } from "../../../../core/rbac/companyScope";
import { parsePaginationParams } from "../../../../core/validators/pagination.validator";
import { listVehiclesService } from "../services/vehicles/list_vehicles.service";

// GET /api/dispatch-guide/vehicles?page=&limit=&orderBy=&orderDir=&searchTerm=&status=&companyId=
export const listVehiclesController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { page, limit, orderBy, orderDir } = parsePaginationParams(req.query);
  const result = await listVehiclesService({
    companyId: resolveListCompanyFilter(user, req.query.companyId),
    page,
    limit,
    orderBy,
    orderDir,
    searchTerm: typeof req.query.searchTerm === "string" ? req.query.searchTerm : undefined,
    status: typeof req.query.status === "string" ? req.query.status : undefined,
  });
  ok(res, 200, result);
});

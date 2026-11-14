import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { resolveListCompanyFilter } from "../../../../core/rbac/companyScope";
import { parsePaginationParams } from "../../../../core/validators/pagination.validator";
import { listDriversService } from "../services/drivers/list_drivers.service";

// GET /api/dispatch-guide/drivers?page=&limit=&orderBy=&orderDir=&searchTerm=&status=&companyId=
export const listDriversController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { page, limit, orderBy, orderDir } = parsePaginationParams(req.query);
  const result = await listDriversService({
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

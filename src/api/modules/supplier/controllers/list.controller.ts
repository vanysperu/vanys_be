import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { parsePaginationParams } from "../../../../core/validators/pagination.validator";
import { resolveListCompanyFilter } from "../../../../core/rbac/companyScope";
import { listSuppliersService } from "../services/list.service";

// GET /api/supplier/list?page&limit&orderBy&orderDir&searchTerm&status&companyId
export const listSuppliersController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { page, limit, orderBy, orderDir } = parsePaginationParams(req.query);
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  // "active,inactive" (los dos marcados en el filtro) = sin filtro.
  const singleStatus = status === "active" || status === "inactive" ? status : undefined;

  const result = await listSuppliersService({
    companyId: resolveListCompanyFilter(user, req.query.companyId),
    page,
    limit,
    orderBy,
    orderDir,
    searchTerm: typeof req.query.searchTerm === "string" ? req.query.searchTerm : undefined,
    status: singleStatus,
  });
  ok(res, 200, result);
});

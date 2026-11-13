import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { parsePaginationParams } from "../../../../core/validators/pagination.validator";
import { resolveListCompanyFilter } from "../../../../core/rbac/companyScope";
import { listSourcesService } from "../services/sources/list_sources.service";

// GET /api/supplier-stock/sources?page&limit&status&companyId
export const listSourcesController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { page, limit, orderDir } = parsePaginationParams(req.query);
  const status = req.query.status === "active" || req.query.status === "inactive" ? req.query.status : undefined;
  const result = await listSourcesService({ companyId: resolveListCompanyFilter(user, req.query.companyId), page, limit, orderDir, status });
  ok(res, 200, result);
});

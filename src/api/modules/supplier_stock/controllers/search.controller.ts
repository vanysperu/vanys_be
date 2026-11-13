import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { parsePaginationParams } from "../../../../core/validators/pagination.validator";
import { resolveTargetCompanyId } from "../../../../core/rbac/companyScope";
import { assertCompanyHasStockFeature } from "../services/shared/source_shared";
import { searchStockService } from "../services/search.service";

// GET /api/supplier-stock/search?searchTerm&onlyUnlinked&page&limit&companyId
export const searchStockController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const companyId = await resolveTargetCompanyId(user, req.query.companyId, "consultas de stock");
  await assertCompanyHasStockFeature(companyId);
  const { page, limit } = parsePaginationParams(req.query);
  const result = await searchStockService({
    companyId,
    page,
    limit,
    searchTerm: typeof req.query.searchTerm === "string" ? req.query.searchTerm : undefined,
    onlyUnlinked: String(req.query.onlyUnlinked) === "true",
  });
  ok(res, 200, result);
});

import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { resolveListCompanyFilter } from "../../../../core/rbac/companyScope";
import { parsePaginationParams } from "../../../../core/validators/pagination.validator";
import { listCarriersService } from "../services/carriers/list_carriers.service";

// GET /api/dispatch-guide/carriers?searchTerm=&companyId=
export const listCarriersController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { page, limit } = parsePaginationParams(req.query);
  const searchTerm = typeof req.query.searchTerm === "string" ? req.query.searchTerm : undefined;
  ok(res, 200, await listCarriersService({ companyId: resolveListCompanyFilter(user, req.query.companyId), page, limit, searchTerm }));
});

import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { parsePaginationParams } from "../../../../core/validators/pagination.validator";
import { resolveCompanyForInventory } from "../services/shared/inventory_company";
import { listStockService } from "../services/stock/list_stock.service";

// GET /api/inventory/stock
export const listStockController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const companyId = await resolveCompanyForInventory(user, req.query.companyId);
  const { page, limit } = parsePaginationParams(req.query);
  const result = await listStockService(
    {
      companyId,
      page,
      limit,
      warehouseId: Number(req.query.warehouseId) || undefined,
      searchTerm: typeof req.query.searchTerm === "string" ? req.query.searchTerm : undefined,
      includeZero: String(req.query.includeZero) === "true",
    },
    user
  );
  ok(res, 200, result);
});

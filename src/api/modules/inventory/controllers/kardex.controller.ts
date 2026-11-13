import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { parsePaginationParams } from "../../../../core/validators/pagination.validator";
import { resolveCompanyForInventory } from "../services/shared/inventory_company";
import { kardexService } from "../services/stock/kardex.service";

// GET /api/inventory/kardex?productId&color&warehouseId&dateFrom&dateTo
export const kardexController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const companyId = await resolveCompanyForInventory(user, req.query.companyId);
  const { page, limit } = parsePaginationParams(req.query);
  const result = await kardexService(
    {
      companyId,
      productId: Number(req.query.productId),
      color: typeof req.query.color === "string" ? req.query.color : "",
      warehouseId: Number(req.query.warehouseId) || undefined,
      dateFrom: typeof req.query.dateFrom === "string" && req.query.dateFrom ? req.query.dateFrom : undefined,
      dateTo: typeof req.query.dateTo === "string" && req.query.dateTo ? req.query.dateTo : undefined,
      page,
      limit,
    },
    user
  );
  ok(res, 200, result);
});

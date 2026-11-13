import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { resolveCompanyForInventory } from "../services/shared/inventory_company";
import { stockByProductsService } from "../services/stock/stock_by_products.service";

// GET /api/inventory/stock/by-products?productIds=1,2 — stock propio al cotizar
export const stockByProductsController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const companyId = await resolveCompanyForInventory(user, req.query.companyId);
  const productIds = String(req.query.productIds).split(",").map(Number);
  ok(res, 200, await stockByProductsService(companyId, productIds, user));
});

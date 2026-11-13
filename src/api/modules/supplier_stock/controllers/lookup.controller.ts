import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { resolveTargetCompanyId } from "../../../../core/rbac/companyScope";
import { assertCompanyHasStockFeature } from "../services/shared/source_shared";
import { lookupProductStockService } from "../services/lookup.service";

// GET /api/supplier-stock/lookup?productIds=1,2,3 — stock de cada producto de
// la cotización, por fuente y total, en UNA llamada.
export const lookupStockController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const companyId = await resolveTargetCompanyId(user, req.query.companyId, "consultas de stock");
  await assertCompanyHasStockFeature(companyId);
  const productIds = String(req.query.productIds).split(",").map(Number);
  ok(res, 200, await lookupProductStockService(companyId, productIds));
});

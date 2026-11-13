import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { resolveTargetCompanyId } from "../../../../core/rbac/companyScope";
import { createSourceService } from "../services/sources/create_source.service";
import type { StockSourceInput } from "../types/supplier_stock.types";

// POST /api/supplier-stock/sources
export const createSourceController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const companyId = await resolveTargetCompanyId(user, req.body.company_id, "fuentes de stock");
  const source = await createSourceService(companyId, req.body as StockSourceInput, user.userId);
  ok(res, 201, source, "Fuente de stock creada");
});

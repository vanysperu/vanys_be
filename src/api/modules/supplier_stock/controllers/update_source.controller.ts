import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { updateSourceService } from "../services/sources/update_source.service";
import type { StockSourceInput } from "../types/supplier_stock.types";

// PUT /api/supplier-stock/sources/:id
export const updateSourceController = asyncHandler(async (req: Request, res: Response) => {
  const source = await updateSourceService(Number(req.params.id), req.body as StockSourceInput, req.user as IToken);
  ok(res, 200, source, "Fuente de stock actualizada");
});

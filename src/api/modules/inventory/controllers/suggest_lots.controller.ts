import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { suggestLotsService } from "../services/stock/suggest_lots.service";

// GET /api/inventory/lots/suggest?warehouseId&productId&color — FEFO
export const suggestLotsController = asyncHandler(async (req: Request, res: Response) => {
  const color = typeof req.query.color === "string" ? req.query.color : "";
  ok(res, 200, await suggestLotsService(Number(req.query.warehouseId), Number(req.query.productId), color, req.user as IToken));
});

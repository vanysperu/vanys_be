import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { resolveCompanyForInventory } from "../services/shared/inventory_company";
import { setTracksStockService } from "../services/products/set_tracks_stock.service";

// PUT /api/inventory/products/tracks-stock — "Maneja stock" en bloque
export const setTracksStockController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const companyId = await resolveCompanyForInventory(user, req.body.company_id);
  const { productIds, all, tracksStock } = req.body as { productIds?: number[]; all?: boolean; tracksStock: boolean };
  const result = await setTracksStockService(companyId, { productIds, all, tracksStock }, user.userId);
  ok(res, 200, result, `${result.updated} producto(s) actualizados`);
});

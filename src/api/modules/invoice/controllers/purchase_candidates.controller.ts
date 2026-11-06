import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { assertCanTouchPurchaseOrderItem } from "../../purchase_order/controllers/purchase_order.controller";
import { listPurchaseCandidatesService } from "../services/purchase_candidates.service";

// GET /invoice/purchase-candidates?itemId=&search=
// Mismo alcance que registrar la compra de ese item: la empresa y la tienda
// salen del item, nunca de lo que mande el frontend.
export const listPurchaseCandidatesController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const itemId = Number(req.query.itemId);
  await assertCanTouchPurchaseOrderItem(itemId, user);
  const search = typeof req.query.search === "string" && req.query.search.trim() ? req.query.search.trim() : undefined;
  const candidates = await listPurchaseCandidatesService(itemId, search);
  ok(res, 200, candidates, candidates.length === 0 ? "No hay facturas para elegir" : "Facturas obtenidas correctamente");
});

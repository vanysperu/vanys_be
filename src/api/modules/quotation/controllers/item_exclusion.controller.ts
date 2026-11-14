import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { setItemExclusionService } from "../services/update/item_exclusion.service";

// PUT /quotation/item/:itemId/excluded { excluded: boolean }
// Producto "no aceptado" por el cliente (o reactivado), sin editar la cotización.
export const setItemExclusionController = asyncHandler(async (req: Request, res: Response) => {
  const result = await setItemExclusionService(Number(req.params.itemId), req.body.excluded === true, req.user as IToken);
  ok(res, 200, result, result.is_excluded ? "Producto marcado como no aceptado" : "Producto reactivado");
});

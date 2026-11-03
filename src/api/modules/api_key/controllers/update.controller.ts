import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { updateApiKeyService } from "../services/update.service";

// PUT /api-key/update/:id — nombre y tienda.
export const updateApiKeyController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { name, business_unit_id } = req.body;
  const updated = await updateApiKeyService(Number(req.params.id), { name, business_unit_id }, user.userId);
  ok(res, 200, updated, "API key actualizada correctamente");
});

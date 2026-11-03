import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { disableApiKeyService } from "../services/disable.service";

// PUT /api-key/disable/:id — revoca la key (de una sola vía).
export const disableApiKeyController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const revoked = await disableApiKeyService(Number(req.params.id), user.userId);
  ok(res, 200, revoked, "API key revocada: deja de funcionar al instante");
});

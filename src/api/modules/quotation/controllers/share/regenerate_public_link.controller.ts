import { Request, Response } from "express";
import { IToken } from "../../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../../core/utils/asyncHandler";
import { ok } from "../../../../../core/utils/response";
import { regeneratePublicLinkService } from "../../services/share/regenerate_public_link.service";

// POST /api/quotation/:id/public-link/regenerate — enlace nuevo; el anterior deja de funcionar.
export const regeneratePublicLinkController = asyncHandler(async (req: Request, res: Response) => {
  const link = await regeneratePublicLinkService(Number(req.params.id), req.user as IToken);
  ok(res, 200, link, "Enlace nuevo listo: el anterior ya no funciona");
});

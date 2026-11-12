import { Request, Response } from "express";
import { IToken } from "../../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../../core/utils/asyncHandler";
import { ok } from "../../../../../core/utils/response";
import { getPublicLinkService } from "../../services/share/get_public_link.service";

// GET /api/quotation/:id/public-link — enlace para compartir (lo crea la primera vez).
export const getPublicLinkController = asyncHandler(async (req: Request, res: Response) => {
  const link = await getPublicLinkService(Number(req.params.id), req.user as IToken);
  ok(res, 200, link);
});

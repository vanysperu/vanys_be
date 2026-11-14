import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { discardGuideService } from "../services/guides/discard_guide.service";

// POST /api/dispatch-guide/guides/:id/discard (solo borradores)
export const discardGuideController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, 200, await discardGuideService(Number(req.params.id), req.user as IToken), "Borrador descartado");
});

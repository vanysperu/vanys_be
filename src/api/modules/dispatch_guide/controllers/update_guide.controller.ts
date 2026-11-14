import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { updateGuideService } from "../services/guides/update_guide.service";
import type { GuideInput } from "../types/dispatch_guide.types";

// PUT /api/dispatch-guide/guides/:id (solo borradores)
export const updateGuideController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, 200, await updateGuideService(Number(req.params.id), req.body as GuideInput, req.user as IToken), "Borrador de guía guardado");
});

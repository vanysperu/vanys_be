import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { voidGuideService } from "../services/guides/void_guide.service";

// POST /api/dispatch-guide/guides/:id/void { reason } (guía registrada; la baja en SUNAT se hace en SOL)
export const voidGuideController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, 200, await voidGuideService(Number(req.params.id), String(req.body.reason), req.user as IToken), "Guía anulada");
});

import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { unsubscribePushService } from "../services/unsubscribe.service";

// POST /api/push/unsubscribe { endpoint }
export const unsubscribePushController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, 200, await unsubscribePushService(req.user as IToken, String(req.body.endpoint)), "Notificaciones desactivadas en este teléfono");
});

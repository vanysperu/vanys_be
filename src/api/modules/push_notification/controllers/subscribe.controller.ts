import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { subscribePushService } from "../services/subscribe.service";
import type { PushSubscriptionInput } from "../types/push_notification.types";

// POST /api/push/subscribe { endpoint, keys: { p256dh, auth } }
export const subscribePushController = asyncHandler(async (req: Request, res: Response) => {
  const result = await subscribePushService(req.user as IToken, req.body as PushSubscriptionInput, req.get("user-agent") ?? null);
  ok(res, 200, result, "Notificaciones activadas en este teléfono");
});

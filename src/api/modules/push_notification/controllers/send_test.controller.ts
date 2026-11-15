import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { sendTestPushService } from "../services/send_test.service";

// POST /api/push/test — notificación de prueba a los teléfonos del propio usuario.
export const sendTestPushController = asyncHandler(async (req: Request, res: Response) => {
  const result = await sendTestPushService(req.user as IToken);
  ok(res, 200, result, result.sent > 0 ? "Notificación de prueba enviada" : "No se pudo enviar la notificación de prueba");
});

import { Request, Response } from "express";
import { IToken } from "../../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../../core/utils/asyncHandler";
import { ok } from "../../../../../core/utils/response";
import { logWhatsappShareService } from "../../services/share/log_whatsapp_share.service";

// POST /api/quotation/:id/share/whatsapp { phone? } — deja en el historial que se mandó por WhatsApp.
export const logWhatsappShareController = asyncHandler(async (req: Request, res: Response) => {
  const phone = typeof req.body.phone === "string" && req.body.phone.trim() ? req.body.phone.trim() : null;
  await logWhatsappShareService(Number(req.params.id), phone, req.user as IToken);
  ok(res, 200, null);
});

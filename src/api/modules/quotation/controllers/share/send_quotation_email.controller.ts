import { Request, Response } from "express";
import { IToken } from "../../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../../core/utils/asyncHandler";
import { ok } from "../../../../../core/utils/response";
import { sendQuotationEmailService } from "../../services/share/send_quotation_email.service";

// POST /api/quotation/:id/share/email { to, cc?, subject, message, attachPdf }
export const sendQuotationEmailController = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as { to: string; cc?: string | null; subject: string; message: string; attachPdf: boolean };
  const result = await sendQuotationEmailService(
    Number(req.params.id),
    { to: body.to, cc: body.cc?.trim() || null, subject: body.subject, message: body.message, attachPdf: Boolean(body.attachPdf) },
    req.user as IToken
  );
  ok(
    res,
    200,
    result,
    result.emailConfigured
      ? `Cotización enviada a ${body.to}`
      : "El correo no está configurado en el servidor: no se pudo enviar. Compártela por WhatsApp o copia el enlace."
  );
});

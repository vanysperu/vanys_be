import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { resetQuotation } from "../services/reset/reset.service";

// PUT /quotation/:id/reset — solo Super Administrador (requireSystemRole en la
// ruta). Borra físicamente lo que generó la cotización: no se puede deshacer.
export const resetQuotationController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const result = await resetQuotation({ quotationId: Number(req.params.id), reason: req.body.reason, actorId: user.userId });
  ok(res, 200, result, "Cotización reseteada a Pendiente");
});

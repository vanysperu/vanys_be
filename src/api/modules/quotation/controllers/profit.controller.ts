import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { AppError } from "../../../../core/errors/AppError";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { assertQuotationBelongsToCaller } from "./quotation.controller";
import { getQuotationProfitService } from "../services/find/profit.service";

// Ganancia de una cotización: mismo alcance que su detalle (empresa y tienda
// del usuario); el permiso lo da el recurso cotizacion.profit.view.button.
export const getQuotationProfitController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const quotationId = Number(req.params.id);
  if (!(await assertQuotationBelongsToCaller(quotationId, user))) {
    throw new AppError(403, "No tienes acceso a esta cotización");
  }
  ok(res, 200, await getQuotationProfitService(quotationId), "Ganancia de la cotización obtenida correctamente");
});

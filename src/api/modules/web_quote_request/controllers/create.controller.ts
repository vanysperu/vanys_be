import { Request, Response } from "express";
import { AppError } from "../../../../core/errors/AppError";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { createWebQuoteRequestService } from "../services/create.service";
import { WebQuoteRequestInput } from "../types/web_quote_request.types";

// POST /public/quotation-request — la web de la empresa envía lo que eligió
// el cliente. Autenticado con API key (requireApiKey), no con sesión.
export const createWebQuoteRequestController = asyncHandler(async (req: Request, res: Response) => {
  const apiKey = req.apiKey;
  // requireApiKey siempre va antes en la ruta: si falta, es un error de
  // configuración de la ruta, nunca un pedido válido.
  if (!apiKey) throw new AppError(401, "API key inválida o revocada", undefined, "INVALID_API_KEY");

  const { client, items } = req.body as WebQuoteRequestInput;
  const result = await createWebQuoteRequestService({ client, items }, apiKey);

  const message =
    result.missing_items.length > 0
      ? "Pedido recibido. Algunos productos no existen y el equipo fue notificado"
      : "Pedido recibido correctamente";
  return ok(res, 201, result, message);
});

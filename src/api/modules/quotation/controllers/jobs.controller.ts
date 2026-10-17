import { Request, Response } from "express";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { expireOverdueQuotations } from "../services/jobs/expireQuotations.job";

// Lo dispara el cron del hosting (cada hora), no un usuario. En el hosting
// la app se apaga sola cuando no recibe tráfico, así que el setInterval
// interno no alcanza: sin tráfico, las cotizaciones vencidas seguirían
// figurando como "Pendiente". Este request además "despierta" la app.
// El job es idempotente: correrlo de más no cambia nada.
export const expireQuotationsJobController = asyncHandler(async (_req: Request, res: Response) => {
  const expired = await expireOverdueQuotations();
  ok(res, 200, { expired }, `${expired} cotización(es) marcada(s) como vencida(s)`);
});

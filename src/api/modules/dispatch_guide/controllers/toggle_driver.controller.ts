import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { toggleDriverStatusService } from "../services/drivers/disable_driver.service";

// PUT /api/dispatch-guide/drivers/:id/disable — deshabilita o habilita (soft).
export const toggleDriverController = asyncHandler(async (req: Request, res: Response) => {
  const result = await toggleDriverStatusService(Number(req.params.id), req.user as IToken);
  ok(res, 200, result, result.active ? "Conductor habilitado" : "Conductor deshabilitado");
});

import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { toggleVehicleStatusService } from "../services/vehicles/disable_vehicle.service";

// PUT /api/dispatch-guide/vehicles/:id/disable — deshabilita o habilita (soft).
export const toggleVehicleController = asyncHandler(async (req: Request, res: Response) => {
  const result = await toggleVehicleStatusService(Number(req.params.id), req.user as IToken);
  ok(res, 200, result, result.active ? "Vehículo habilitado" : "Vehículo deshabilitado");
});

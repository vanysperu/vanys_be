import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { updateVehicleService } from "../services/vehicles/update_vehicle.service";
import type { VehicleInput } from "../types/dispatch_guide.types";

// PUT /api/dispatch-guide/vehicles/:id
export const updateVehicleController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, 200, await updateVehicleService(Number(req.params.id), req.body as VehicleInput, req.user as IToken), "Vehículo actualizado");
});

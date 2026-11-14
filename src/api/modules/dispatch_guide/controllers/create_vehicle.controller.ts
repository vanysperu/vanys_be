import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { resolveCompanyForGuides } from "../services/shared/guide_company";
import { createVehicleService } from "../services/vehicles/create_vehicle.service";
import type { VehicleInput } from "../types/dispatch_guide.types";

// POST /api/dispatch-guide/vehicles
export const createVehicleController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const companyId = await resolveCompanyForGuides(user, req.body.company_id, "vehículos");
  ok(res, 201, await createVehicleService(companyId, req.body as VehicleInput, user.userId), "Vehículo creado");
});

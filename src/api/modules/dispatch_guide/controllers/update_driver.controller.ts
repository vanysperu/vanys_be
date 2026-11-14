import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { updateDriverService } from "../services/drivers/update_driver.service";
import type { DriverInput } from "../types/dispatch_guide.types";

// PUT /api/dispatch-guide/drivers/:id
export const updateDriverController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, 200, await updateDriverService(Number(req.params.id), req.body as DriverInput, req.user as IToken), "Conductor actualizado");
});

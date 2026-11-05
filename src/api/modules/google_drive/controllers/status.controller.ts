import { Request, Response } from "express";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { getDriveStatusService } from "../services/status.service";

// GET /google-drive/status/:companyId — solo Super Administrador.
export const driveStatusController = asyncHandler(async (req: Request, res: Response) => {
  const status = await getDriveStatusService(Number(req.params.companyId));
  ok(res, 200, status, "Estado de Google Drive obtenido correctamente");
});

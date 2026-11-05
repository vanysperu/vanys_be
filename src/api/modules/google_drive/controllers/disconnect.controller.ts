import { Request, Response } from "express";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { disconnectDriveService } from "../services/disconnect.service";

// PUT /google-drive/disconnect/:companyId — solo Super Administrador. No borra
// nada en Drive.
export const driveDisconnectController = asyncHandler(async (req: Request, res: Response) => {
  const result = await disconnectDriveService(Number(req.params.companyId));
  ok(res, 200, result, "Google Drive desconectado. Los archivos que ya estaban en Drive se conservan.");
});

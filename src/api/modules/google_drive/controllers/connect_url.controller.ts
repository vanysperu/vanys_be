import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { getDriveConnectUrlService } from "../services/connect_url.service";

// GET /google-drive/connect-url/:companyId — solo Super Administrador.
export const driveConnectUrlController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const result = await getDriveConnectUrlService(Number(req.params.companyId), user.userId);
  ok(res, 200, result, "Abre la dirección para conectar Google Drive");
});

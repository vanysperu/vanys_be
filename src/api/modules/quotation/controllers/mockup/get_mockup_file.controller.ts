import { Request, Response } from "express";
import { IToken } from "../../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../../core/utils/asyncHandler";
import { getMockupFileService } from "../../services/mockup/get_mockup_file.service";

// GET /quotation/mockup/:mockupId/file — el archivo en sí (no JSON). Privado:
// no se guarda en la caché del navegador ni de intermediarios.
export const getMockupFileController = asyncHandler(async (req: Request, res: Response) => {
  const file = await getMockupFileService(Number(req.params.mockupId), req.user as IToken);
  res.setHeader("Content-Type", file.mimeType);
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(file.fileName)}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(file.data);
});

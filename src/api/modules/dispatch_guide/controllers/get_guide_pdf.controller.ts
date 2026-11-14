import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { getGuidePdfService } from "../services/guides/get_guide_pdf.service";

// GET /api/dispatch-guide/guides/:id/file — privado: solo con sesión.
export const getGuidePdfController = asyncHandler(async (req: Request, res: Response) => {
  const file = await getGuidePdfService(Number(req.params.id), req.user as IToken);
  res.setHeader("Content-Type", file.mimeType);
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(file.fileName)}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(file.data);
});

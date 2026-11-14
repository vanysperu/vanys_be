import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { AppError } from "../../../../core/errors/AppError";
import { uploadGuidePdfService } from "../services/guides/upload_guide_pdf.service";

// POST /api/dispatch-guide/guides/:id/file (multipart "file": el PDF de SUNAT o una foto)
export const uploadGuidePdfController = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new AppError(400, "No se recibió ningún archivo");
  ok(res, 200, await uploadGuidePdfService(Number(req.params.id), req.file, req.user as IToken), "Archivo de la guía guardado");
});

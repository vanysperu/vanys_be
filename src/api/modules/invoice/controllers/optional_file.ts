import { NextFunction, Request, Response } from "express";
import { AppError } from "../../../../core/errors/AppError";
import { hasValidInvoiceSignature, uploadInvoiceFile } from "../../../../middlewares/upload-invoice";

// Multipart con archivo OPCIONAL ("file") para registrar una factura y subir
// su foto o PDF en el mismo paso. Corre antes de los validadores (multer es
// quien llena req.body) y rechaza un archivo inválido ANTES de vincular nada.
export const optionalInvoiceFile = (req: Request, res: Response, next: NextFunction) => {
  if (!req.is("multipart/form-data")) return next();
  uploadInvoiceFile(req, res, (err: unknown) => {
    if (err) return next(new AppError(400, err instanceof Error ? err.message : "No se pudo subir el archivo"));
    if (req.file && !hasValidInvoiceSignature(req.file.buffer, req.file.mimetype)) {
      return next(new AppError(400, "El archivo no es una foto o un PDF válido"));
    }
    return next();
  });
};

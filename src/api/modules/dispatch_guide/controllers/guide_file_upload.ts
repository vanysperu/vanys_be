import { NextFunction, Request, Response } from "express";
import { AppError } from "../../../../core/errors/AppError";
import { hasValidInvoiceSignature, uploadInvoiceFile } from "../../../../middlewares/upload-invoice";

// Archivo de la guía (el PDF que da SUNAT, o una foto): mismas reglas que una
// factura (PDF o imagen, máx. 5 MB, firma real del archivo). Corre antes de los
// validadores (multer llena req.body). Opcional: sin multipart, sigue de largo.
export const guideFileUpload = (req: Request, res: Response, next: NextFunction) => {
  if (!req.is("multipart/form-data")) return next();
  uploadInvoiceFile(req, res, (err: unknown) => {
    if (err) return next(new AppError(400, err instanceof Error ? err.message : "No se pudo subir el archivo"));
    if (req.file && !hasValidInvoiceSignature(req.file.buffer, req.file.mimetype)) {
      return next(new AppError(400, "El archivo no es un PDF o una foto válida"));
    }
    return next();
  });
};

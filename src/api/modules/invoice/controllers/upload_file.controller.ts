import { NextFunction, Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { AppError } from "../../../../core/errors/AppError";
import { ok } from "../../../../core/utils/response";
import { hasValidInvoiceSignature, uploadInvoiceFile } from "../../../../middlewares/upload-invoice";
import { uploadInvoiceFileService } from "../services/upload_file.service";
import { invoiceActorOf } from "./actor";

// POST /invoice/:id/file (multipart, campo "file"): foto WEBP/JPG/PNG o PDF,
// máx. 5 MB. El callback de multer no se puede await-ear: next(new AppError())
// explícito (igual que la foto de un producto).
export const uploadInvoiceFileController = (req: Request, res: Response, next: NextFunction) => {
  uploadInvoiceFile(req, res, (err: unknown) => {
    if (err) return next(new AppError(400, err instanceof Error ? err.message : "No se pudo subir el archivo"));
    if (!req.file) return next(new AppError(400, "No se recibió ningún archivo"));
    if (!hasValidInvoiceSignature(req.file.buffer, req.file.mimetype)) {
      return next(new AppError(400, "El archivo no es una foto o un PDF válido"));
    }

    uploadInvoiceFileService(Number(req.params.id), req.file, invoiceActorOf(req.user as IToken))
      .then((result) =>
        ok(
          res,
          200,
          result,
          result.drive_status === "pending" ? "Factura guardada; se está copiando a Google Drive" : "Factura guardada correctamente"
        )
      )
      .catch(next);
  });
};

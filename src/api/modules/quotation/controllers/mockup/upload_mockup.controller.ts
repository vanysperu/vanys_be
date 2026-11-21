import { Request, Response } from "express";
import { IToken } from "../../../../interfaces/IToken.interface";
import { AppError } from "../../../../../core/errors/AppError";
import { asyncHandler } from "../../../../../core/utils/asyncHandler";
import { ok } from "../../../../../core/utils/response";
import { hasValidInvoiceSignature, uploadInvoiceFile } from "../../../../../middlewares/upload-invoice";
import { assertQuotationWritable } from "../../services/shared/quotation_scope";
import { uploadMockupService } from "../../services/mockup/upload_mockup.service";

// Mismo cargador que el archivo de una factura: foto (WEBP/JPG/PNG) o PDF,
// máx. 5 MB, en memoria (va a la base, nunca al disco del hosting).
const receiveFile = (req: Request, res: Response): Promise<void> =>
  new Promise((resolve, reject) => {
    uploadInvoiceFile(req, res, (err: unknown) => {
      if (err) return reject(new AppError(400, err instanceof Error ? err.message : "No se pudo subir el archivo"));
      resolve();
    });
  });

const toItemId = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

// POST /quotation/:id/mockups (multipart: "file", y opcionales
// "quotation_item_id" y "caption") — sube un diseño (21-nov). Primero el
// alcance de escritura (no se recibe el archivo de quien no puede subirlo).
export const uploadMockupController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const quotationId = Number(req.params.id);
  await assertQuotationWritable(quotationId, user, "subir diseños");

  await receiveFile(req, res);
  if (!req.file) throw new AppError(400, "No se recibió ningún archivo");
  if (!hasValidInvoiceSignature(req.file.buffer, req.file.mimetype)) {
    throw new AppError(400, "El archivo no es una imagen o un PDF válido");
  }

  const body = req.body as { quotation_item_id?: unknown; caption?: unknown };
  const caption = typeof body.caption === "string" ? body.caption.trim().slice(0, 255) || null : null;
  const mockup = await uploadMockupService(
    quotationId,
    req.file,
    { quotation_item_id: toItemId(body.quotation_item_id), caption },
    user
  );
  ok(res, 201, mockup, "Diseño subido correctamente");
});

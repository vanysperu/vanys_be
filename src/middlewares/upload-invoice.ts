import multer from "multer";
import { hasValidImageSignature } from "./upload-image";

// Archivo de una factura: foto (el navegador ya la convierte a WEBP) o PDF.
// En memoria: se guarda en la base y/o en Google Drive, nunca en el disco del
// hosting (un nuevo despliegue lo borraría).
export const INVOICE_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const INVOICE_MIME_TYPES = ["image/webp", "image/jpeg", "image/png", "application/pdf"];

export const uploadInvoiceFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: INVOICE_MAX_FILE_SIZE_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!INVOICE_MIME_TYPES.includes(file.mimetype)) {
      callback(new Error("Solo se aceptan fotos (WEBP, JPG, PNG) o PDF"));
      return;
    }
    callback(null, true);
  },
}).single("file");

// La firma real del archivo, no solo lo que dice el navegador.
export const hasValidInvoiceSignature = (bytes: Buffer, mimeType: string): boolean =>
  mimeType === "application/pdf" ? bytes.subarray(0, 5).toString("latin1") === "%PDF-" : hasValidImageSignature(bytes, mimeType);

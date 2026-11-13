import { NextFunction, Request, Response } from "express";
import { AppError } from "../core/errors/AppError";
import multer from "multer";

// Excel o CSV de stock de un proveedor (Sprint 2, ítem 6). En memoria: se lee
// y se descarta, nunca se guarda en el disco del hosting.
export const STOCK_FILE_MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = /\.(xlsx|xlsm|xls|csv)$/i;

export const uploadStockFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: STOCK_FILE_MAX_BYTES, files: 1, fields: 10 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_EXTENSIONS.test(file.originalname)) {
      callback(new Error("Solo se aceptan archivos Excel (.xlsx, .xls) o CSV"));
      return;
    }
    callback(null, true);
  },
}).single("file");

// La firma real del archivo, no solo su extensión: .xlsx es un ZIP, .xls un
// documento OLE y un CSV es texto (sin bytes nulos al inicio).
export const hasValidStockFileSignature = (bytes: Buffer, fileName: string): boolean => {
  if (/\.(xlsx|xlsm)$/i.test(fileName)) return bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  if (/\.xls$/i.test(fileName)) return bytes.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]));
  return !bytes.subarray(0, 4096).includes(0);
};

// Middleware: lee el archivo (si viene) y valida su firma. Sin archivo sigue
// igual (la vista previa también acepta un enlace en JSON).
export const parseStockUpload = (req: Request, res: Response, next: NextFunction): void => {
  uploadStockFile(req, res, (error: unknown) => {
    if (error) return next(new AppError(400, error instanceof Error ? error.message : "No se pudo subir el archivo"));
    if (req.file && !hasValidStockFileSignature(req.file.buffer, req.file.originalname)) {
      return next(new AppError(400, "El archivo no es un Excel o CSV válido"));
    }
    next();
  });
};

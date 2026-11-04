import { NextFunction, Request, Response } from "express";
import { AppError } from "../../../../core/errors/AppError";
import { ok } from "../../../../core/utils/response";
import { hasValidImageSignature, uploadCompanyImage } from "../../../../middlewares/upload-image";
import { createCompanyAsset } from "../../uploads/services/create/company_asset.service";

// POST /public/products/images (multipart, campo "file") — sube la foto de
// un producto al sistema (se guarda en la base, como los logos) y devuelve su
// ruta para mandarla como `image_path` en la subida masiva. La imagen queda en
// la empresa de la key; si no se usa en 24 h, la limpieza la borra.
// Callback de multer: next(new AppError(...)) explícito (no se puede await).
export const uploadPublicProductImageController = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.apiKey;
  if (!apiKey) return next(new AppError(401, "API key inválida o revocada", undefined, "INVALID_API_KEY"));

  uploadCompanyImage(req, res, (err: unknown) => {
    if (err) return next(new AppError(400, err instanceof Error ? err.message : "No se pudo subir la imagen"));
    if (!req.file) return next(new AppError(400, "No se recibió ninguna imagen (campo \"file\")"));
    if (!hasValidImageSignature(req.file.buffer, req.file.mimetype)) {
      return next(new AppError(400, "El archivo no es una imagen PNG, JPG o WEBP válida"));
    }

    createCompanyAsset({
      companyId: apiKey.companyId,
      data: req.file.buffer,
      mimeType: req.file.mimetype,
      createdBy: apiKey.issuedBy,
    })
      .then((asset) =>
        ok(res, 201, { image_path: asset.path, image_url: `${req.protocol}://${req.get("host")}${asset.path}` }, "Foto subida")
      )
      .catch(next);
  });
};

import { NextFunction, Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { AppError } from "../../../../core/errors/AppError";
import { ok } from "../../../../core/utils/response";
import { resolveTargetCompanyId } from "../../../../core/rbac/companyScope";
import { hasValidImageSignature, uploadCompanyImage } from "../../../../middlewares/upload-image";
import { createCompanyAsset } from "../../uploads/services/create/company_asset.service";

// Guarda la imagen en la base (company_asset, mismas reglas que la foto de un
// producto) y devuelve su ruta; el formulario la asigna al anuncio al guardar.
// Si nunca se guarda, la limpieza de imágenes la borra a las 24 h.
const storeAdvertisementImage = async (
  user: IToken,
  requestedCompanyId: unknown,
  file: { buffer: Buffer; mimetype: string }
) => {
  // Empresa dueña: la del usuario; el Super Administrador la manda en el
  // form-data (la del anuncio que está creando o editando).
  const companyId = await resolveTargetCompanyId(user, user.isSystem ? requestedCompanyId : undefined, "anuncios");
  return createCompanyAsset({ companyId, data: file.buffer, mimeType: file.mimetype, createdBy: user.userId });
};

// POST /advertisement/image (multipart, campo "file"). El callback de multer no
// se puede await-ear: por eso next(new AppError(...)) explícito (igual que la
// foto de un producto).
export const uploadAdvertisementImageController = (req: Request, res: Response, next: NextFunction) => {
  uploadCompanyImage(req, res, (err: unknown) => {
    if (err) return next(new AppError(400, err instanceof Error ? err.message : "No se pudo subir la imagen"));
    if (!req.file) return next(new AppError(400, "No se recibió ninguna imagen"));
    if (!hasValidImageSignature(req.file.buffer, req.file.mimetype)) {
      return next(new AppError(400, "El archivo no es una imagen PNG, JPG o WEBP válida"));
    }

    storeAdvertisementImage(req.user as IToken, req.body?.company_id, req.file)
      .then((asset) => ok(res, 201, asset, "Imagen subida correctamente"))
      .catch(next);
  });
};

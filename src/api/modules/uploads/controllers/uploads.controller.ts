import { NextFunction, Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { AppError } from "../../../../core/errors/AppError";
import { ok } from "../../../../core/utils/response";
import { hasValidImageSignature, uploadCompanyImage } from "../../../../middlewares/upload-image";
import { resolveTargetCompanyId } from "../../../../core/rbac/companyScope";
import { createCompanyAsset } from "../services/create/company_asset.service";
import { findCompanyAsset } from "../services/find/company_asset.service";

// Empresa dueña de la imagen: la del usuario. El Super Administrador (sin
// empresa propia) la elige en la pantalla y llega como company_id en el
// form-data — antes se leía solo del token, y el Super Administrador recibía
// "No se recibió ninguna imagen" aunque la pantalla le dejara elegir empresa.
const resolveUploadCompanyId = async (user: IToken, requestedCompanyId: unknown): Promise<number> => {
  if (!user.isSystem && !user.companyId) {
    throw new AppError(400, "Esta acción es solo para usuarios de una empresa");
  }
  return resolveTargetCompanyId(user, user.isSystem ? requestedCompanyId : undefined, "imágenes");
};

const storeUploadedImage = async (user: IToken, requestedCompanyId: unknown, file: { buffer: Buffer; mimetype: string }) => {
  const companyId = await resolveUploadCompanyId(user, requestedCompanyId);
  return createCompanyAsset({ companyId, data: file.buffer, mimeType: file.mimetype, createdBy: user.userId });
};

// Un solo endpoint genérico para cualquier imagen de marca de la empresa
// (logo, QR de Yape/Plin) — el llamador decide después dónde guardar la
// ruta devuelta (company.logo_url, o el ref2 de una fila de
// general_variable category="payment_account"). Evita duplicar el mismo
// manejo de multer para cada caso de uso.
//
// Nota: el callback de multer no es awaitable, así que no puede envolverse
// con `asyncHandler` (un `throw` dentro del callback no llegaría al
// errorHandler central) — por eso acá sí se usa `next(new AppError(...))`
// explícito en vez de `throw`.
export const uploadCompanyAssetController = (req: Request, res: Response, next: NextFunction) => {
  uploadCompanyImage(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : "No se pudo subir la imagen";
      return next(new AppError(400, message));
    }

    if (!req.file) {
      return next(new AppError(400, "No se recibió ninguna imagen"));
    }

    // El MIME del request lo declara el cliente: se confirma por el
    // contenido real antes de aceptar el archivo.
    if (!hasValidImageSignature(req.file.buffer, req.file.mimetype)) {
      return next(new AppError(400, "El archivo no es una imagen PNG, JPG o WEBP válida"));
    }

    storeUploadedImage(req.user as IToken, req.body?.company_id, req.file)
      .then((asset) => ok(res, 201, asset, "Imagen subida correctamente"))
      .catch(next);
  });
};

// Las imágenes se piden por <img src> y desde el PDF, sin cabecera de
// sesión: este endpoint es público (igual que lo era la carpeta estática
// /uploads). El nombre es un UUID imposible de adivinar, y lo que se expone
// es branding que la empresa misma imprime en sus cotizaciones.
const ASSET_CACHE_SECONDS = 30 * 24 * 60 * 60;

export const serveCompanyAssetController = (req: Request, res: Response, next: NextFunction) => {
  const companyId = Number(req.params.companyId);
  const fileName = String(req.params.fileName ?? "");

  findCompanyAsset(companyId, fileName)
    .then((asset) => {
      if (!asset) return next();

      res.setHeader("Content-Type", asset.mimeType);
      res.setHeader("Content-Length", String(asset.data.length));
      // UUID nuevo en cada subida: el contenido de una URL nunca cambia.
      res.setHeader("Cache-Control", `public, max-age=${ASSET_CACHE_SECONDS}, immutable`);
      res.end(asset.data);
    })
    .catch(next);
};

import type { RequestHandler } from "express";
import multer from "multer";
import { resolveUploadsDir } from "../config/paths";

// Las imágenes de marca de cada empresa (logo, QR de Yape/Plin) se guardan
// en la BASE DE DATOS (tabla company_asset), no en disco: el hosting de
// producción reemplaza la carpeta de la app en cada despliegue y todo lo
// subido se perdía. Multer las recibe en memoria (máximo 2 MB) y el
// controller las persiste.
//
// UPLOADS_ROOT queda solo como respaldo de lectura para imágenes antiguas
// que se subieron a disco antes de este cambio (ver server/index.server.ts
// y el generador de PDF).
export const UPLOADS_ROOT = resolveUploadsDir();
export const COMPANY_ASSETS_DIR = "company-assets";

// La extensión con la que se GUARDA el archivo sale de acá, nunca del nombre
// que manda el navegador. Antes se usaba `path.extname(file.originalname)`:
// como el MIME también lo declara el cliente, se podía subir un `x.html`
// diciendo que era "image/png" y se servía como página web — XSS en el
// mismo dominio de la app (robo del token de sesión).
export const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};
const ALLOWED_MIME_TYPES = Object.keys(EXTENSION_BY_MIME_TYPE);
const MB = 1024 * 1024;
const MAX_FILE_SIZE_BYTES = 2 * MB; // 2MB — de sobra para un logo, un QR o la foto de un producto.
// Las imágenes de los anuncios de la web son banners grandes: pueden pesar más.
// (Pedido del usuario, 17-nov-2026; si cambia, cambiar también ADVERTISEMENT_IMAGE_MAX_MB
// en grulla_fe/src/modules/advertisements.)
export const ADVERTISEMENT_IMAGE_MAX_BYTES = 3 * MB;

// Firma real del archivo (primeros bytes). El MIME que llega en el request
// es solo lo que el cliente dice que es; esto confirma que el contenido
// realmente es una imagen del tipo declarado.
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

const startsWith = (bytes: Buffer, signature: number[]): boolean =>
  signature.every((byte, index) => bytes[index] === byte);

const isWebp = (bytes: Buffer): boolean =>
  bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";

const SIGNATURE_CHECK_BY_MIME_TYPE: Record<string, (bytes: Buffer) => boolean> = {
  "image/png": (bytes) => startsWith(bytes, PNG_SIGNATURE),
  "image/jpeg": (bytes) => startsWith(bytes, JPEG_SIGNATURE),
  "image/webp": isWebp,
};

// El contenido tiene que coincidir con el tipo DECLARADO (no alcanza con que
// sea "alguna" imagen): así el Content-Type con el que después se sirve
// siempre describe lo que de verdad hay adentro.
export const hasValidImageSignature = (bytes: Buffer, mimeType: string): boolean =>
  SIGNATURE_CHECK_BY_MIME_TYPE[mimeType]?.(bytes) ?? false;

// Mismo cargador para todas las imágenes de empresa; solo cambia el tope de
// peso. Al pasarse del tope, multer responde "File too large": se traduce al
// español con el máximo real.
const createImageUploader = (maxBytes: number): RequestHandler => {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (_req, file, callback) => {
      if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        return callback(new Error("Solo se permiten imágenes PNG, JPG o WEBP"));
      }
      callback(null, true);
    },
  }).single("file");

  return (req, res, next) =>
    upload(req, res, (error: unknown) => {
      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        return next(new Error(`La imagen supera el máximo de ${maxBytes / MB} MB`));
      }
      next(error);
    });
};

export const uploadCompanyImage = createImageUploader(MAX_FILE_SIZE_BYTES);
export const uploadAdvertisementImage = createImageUploader(ADVERTISEMENT_IMAGE_MAX_BYTES);

// Ruta pública (sin token) donde queda expuesta la imagen — se arma acá para
// no repetir la misma concatenación en cada controller que necesite
// devolver la URL final al frontend. Es el mismo formato que cuando las
// imágenes vivían en disco: los logo_url ya guardados siguen siendo válidos.
export const buildCompanyAssetPath = (companyId: number, filename: string): string =>
  `/uploads/${COMPANY_ASSETS_DIR}/${companyId}/${filename}`;

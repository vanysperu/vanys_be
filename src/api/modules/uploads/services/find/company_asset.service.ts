import fs from "fs";
import path from "path";
import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { COMPANY_ASSETS_DIR, UPLOADS_ROOT } from "../../../../../middlewares/upload-image";

export interface StoredCompanyAsset {
  mimeType: string;
  data: Buffer;
}

// Solo nombres con la forma que genera createCompanyAsset (uuid + extensión
// permitida). Cualquier otra cosa ("../", nombres raros) ni se consulta: es
// la barrera contra path traversal en el respaldo de lectura desde disco.
const FILE_NAME_PATTERN = /^[0-9a-f-]{36}\.(png|jpg|jpeg|webp)$/i;

const MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export const isValidAssetFileName = (fileName: string): boolean => FILE_NAME_PATTERN.test(fileName);

// Imágenes subidas ANTES de guardarlas en la base vivían en disco: si no
// está en la tabla, se intenta ahí, para no romper los logos ya cargados.
const readLegacyAssetFromDisk = (companyId: number, fileName: string): StoredCompanyAsset | null => {
  const absolute = path.join(UPLOADS_ROOT, COMPANY_ASSETS_DIR, String(companyId), fileName);
  if (!fs.existsSync(absolute)) return null;

  const mimeType = MIME_BY_EXTENSION[path.extname(fileName).toLowerCase()];
  if (!mimeType) return null;

  return { mimeType, data: fs.readFileSync(absolute) };
};

export const findCompanyAsset = async (companyId: number, fileName: string): Promise<StoredCompanyAsset | null> => {
  if (!Number.isInteger(companyId) || companyId <= 0 || !isValidAssetFileName(fileName)) return null;

  const row = await DataBase.instance.company_asset.findOne({
    where: { company_id: companyId, file_name: fileName },
    attributes: ["mime_type", "data"],
  });
  if (row) return { mimeType: row.mime_type, data: row.data };

  return readLegacyAssetFromDisk(companyId, fileName);
};

export interface CompanyAssetPathParts {
  companyId: number;
  fileName: string;
}

// "/uploads/company-assets/12/<uuid>.png" -> { companyId: 12, fileName }.
// Devuelve null para cualquier ruta que no tenga exactamente esa forma.
export const parseCompanyAssetPath = (publicPath: string | null | undefined): CompanyAssetPathParts | null => {
  const match = /^\/uploads\/company-assets\/(\d+)\/([^/]+)$/.exec(publicPath ?? "");
  if (!match) return null;

  const [, companyIdRaw = "", fileName = ""] = match;
  return { companyId: Number(companyIdRaw), fileName };
};

// Nombres de archivo de las rutas que son imágenes de ESA empresa; descarta
// vacíos, texto libre y rutas de otra empresa.
export const ownCompanyAssetFileNames = (paths: (string | null | undefined)[], companyId: number): string[] =>
  paths
    .map(parseCompanyAssetPath)
    .filter((parts): parts is CompanyAssetPathParts => parts !== null && parts.companyId === companyId)
    .map((parts) => parts.fileName);

/**
 * Antes de guardar una ruta como logo o QR: si es una ruta de imagen, tiene
 * que ser de ESA empresa y seguir existiendo. Así nadie apunta a la imagen de
 * otra empresa (que además la limpieza de esa otra empresa borraría), ni queda
 * guardada una ruta rota (una subida que quedó sin guardar más de un día ya se
 * limpió). Vacío, texto libre o rutas antiguas pasan como hasta ahora.
 */
export const assertCompanyAssetUsable = async (
  publicPath: string | null | undefined,
  companyId: number | null,
  transaction?: Transaction
): Promise<void> => {
  const parts = parseCompanyAssetPath(publicPath);
  if (!parts) return;
  if (parts.companyId !== companyId) throw new AppError(400, "La imagen no pertenece a esta empresa");

  const stored = await DataBase.instance.company_asset.count({
    where: { company_id: parts.companyId, file_name: parts.fileName },
    transaction,
  });
  if (stored === 0) throw new AppError(400, "La imagen ya no está disponible, vuelve a subirla");
};

// Para el PDF: la imagen embebida como data URI (ver quotation_pdf.service).
export const loadCompanyAssetDataUri = async (publicPath: string | null | undefined): Promise<string | null> => {
  const parsed = parseCompanyAssetPath(publicPath);
  if (!parsed) return null;

  const asset = await findCompanyAsset(parsed.companyId, parsed.fileName);
  if (!asset) return null;

  return `data:${asset.mimeType};base64,${asset.data.toString("base64")}`;
};

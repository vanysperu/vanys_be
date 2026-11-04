import { randomUUID } from "crypto";
import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { nowUtc } from "../../../../../utils/dateUtils";
import { buildCompanyAssetPath, EXTENSION_BY_MIME_TYPE } from "../../../../../middlewares/upload-image";
import { assertCompanyAssetUsable, parseCompanyAssetPath } from "../../../uploads/services/find/company_asset.service";

// ¿La empresa tiene habilitadas las fotos de productos? (lo decide el Super
// Administrador en Empresas).
export async function companyProductImagesEnabled(companyId: number, transaction?: Transaction): Promise<boolean> {
  const company = await DataBase.instance.company.findOne({
    where: { id: companyId },
    attributes: ["product_images_enabled"],
    transaction,
  });
  return Boolean(company?.product_images_enabled);
}

// Empresas (de un conjunto) que tienen habilitadas las fotos: una consulta.
export async function companiesWithProductImages(companyIds: number[]): Promise<Set<number>> {
  if (companyIds.length === 0) return new Set();
  const rows = await DataBase.instance.company.findAll({
    where: { id: companyIds, product_images_enabled: true },
    attributes: ["id"],
  });
  return new Set(rows.map((row) => Number(row.id)));
}

export const assertProductImagesEnabled = async (companyId: number, transaction?: Transaction) => {
  if (await companyProductImagesEnabled(companyId, transaction)) return;
  throw new AppError(
    403,
    "Las fotos de productos no están habilitadas para esta empresa (las habilita el Super Administrador)",
    undefined,
    "PRODUCT_IMAGES_DISABLED"
  );
};

// La foto de un producto es una imagen subida de SU empresa que sigue
// existiendo (mismo control que un logo). Una ruta que no es de imagen se
// rechaza: la foto siempre se sube al sistema, nunca es un enlace externo.
export async function assertProductImageUsable(
  imagePath: string,
  companyId: number,
  transaction?: Transaction
): Promise<void> {
  if (!parseCompanyAssetPath(imagePath)) {
    throw new AppError(400, "La foto tiene que ser una imagen subida al sistema (ruta /uploads/company-assets/...)", undefined, "INVALID_IMAGE_PATH");
  }
  await assertCompanyAssetUsable(imagePath, companyId, transaction);
}

/**
 * Copia una imagen de una empresa a otra (subida masiva con réplica): cada
 * empresa es dueña de sus imágenes (la URL lleva su id y su limpieza solo
 * mira las suyas), así que el producto replicado recibe SU propia copia.
 */
export async function copyCompanyAsset({
  sourcePath,
  targetCompanyId,
  actorId,
  transaction,
}: {
  sourcePath: string;
  targetCompanyId: number;
  actorId: number | null;
  transaction: Transaction;
}): Promise<string> {
  const source = parseCompanyAssetPath(sourcePath);
  if (!source) throw new AppError(400, "Ruta de imagen inválida", undefined, "INVALID_IMAGE_PATH");
  if (source.companyId === targetCompanyId) return sourcePath;

  const asset = await DataBase.instance.company_asset.findOne({
    where: { company_id: source.companyId, file_name: source.fileName },
    attributes: ["mime_type", "size_bytes", "data"],
    transaction,
  });
  if (!asset) throw new AppError(400, "La imagen ya no está disponible, vuelve a subirla", undefined, "INVALID_IMAGE_PATH");

  const fileName = `${randomUUID()}${EXTENSION_BY_MIME_TYPE[asset.mime_type] ?? ".png"}`;
  await DataBase.instance.company_asset.create(
    {
      id: 0,
      company_id: targetCompanyId,
      file_name: fileName,
      mime_type: asset.mime_type,
      size_bytes: asset.size_bytes,
      data: asset.data,
      created_by: actorId,
      created_at: nowUtc(),
      updated_by: null,
      updated_at: null,
    },
    { transaction }
  );
  return buildCompanyAssetPath(targetCompanyId, fileName);
}

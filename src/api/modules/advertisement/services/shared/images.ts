import { Transaction } from "sequelize";
import { AppError } from "../../../../../core/errors/AppError";
import { assertCompanyAssetUsable, parseCompanyAssetPath } from "../../../uploads/services/find/company_asset.service";

// La imagen de un anuncio es SIEMPRE una imagen subida al sistema por SU
// empresa y que sigue existiendo: nunca un enlace externo (la web la muestra
// desde el sistema) ni la imagen de otra empresa.
export async function assertAdvertisementImageUsable(
  imagePath: string,
  companyId: number,
  transaction?: Transaction
): Promise<void> {
  if (!parseCompanyAssetPath(imagePath)) {
    throw new AppError(400, "Sube la imagen del anuncio al sistema", undefined, "INVALID_IMAGE_PATH");
  }
  await assertCompanyAssetUsable(imagePath, companyId, transaction);
}

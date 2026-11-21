import sharp from "sharp";
import { findCompanyAsset, parseCompanyAssetPath } from "../../../uploads/services/find/company_asset.service";

// Lado mayor de la foto en el PDF (px): nítida a ~2 cm y liviana.
const PHOTO_MAX_PX = 240;

/**
 * Foto de un producto lista para el PDF (21-nov). Las fotos se guardan en
 * WEBP (el navegador las convierte al subirlas) y @react-pdf/renderer solo
 * dibuja PNG/JPG: se convierte a JPG con sharp (aprobado por el usuario). Una
 * foto que no existe o no se puede leer devuelve null: el PDF sale igual, con
 * el espacio vacío.
 */
export async function productPhotoForPdf(publicPath: string | null | undefined): Promise<string | null> {
  const parsed = parseCompanyAssetPath(publicPath);
  if (!parsed) return null;
  const asset = await findCompanyAsset(parsed.companyId, parsed.fileName);
  if (!asset) return null;
  try {
    const jpeg = await sharp(asset.data)
      .rotate()
      .resize(PHOTO_MAX_PX, PHOTO_MAX_PX, { fit: "inside", withoutEnlargement: true })
      // Fondo blanco: una foto PNG/WEBP con transparencia no sale negra en JPG.
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 80 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}

import { Op, Transaction, WhereOptions } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { CompanyAssetAttributes } from "../../model/company_asset.model";
import { ownCompanyAssetFileNames } from "../find/company_asset.service";

// El front sube la imagen al ELEGIR el archivo y recién la asigna (logo o QR)
// al presionar "Guardar". Mientras tanto ninguna fila la usa: este margen
// evita borrarla antes de que se guarde. Pasado ese tiempo, una subida que
// nunca se guardó se da por abandonada.
const PENDING_UPLOAD_GRACE_MS = 24 * 60 * 60 * 1000;

// Las únicas columnas que guardan rutas de imágenes de la empresa.
const ASSET_PATH_LIKE = "/uploads/company-assets/%";

// Archivos de ESTA empresa que alguna fila sigue usando: logo (y columnas de
// imagen heredadas) de la empresa, logo de sus tiendas y QR de sus cuentas de
// pago (ref2). Todo filtrado por company_id.
const findReferencedFileNames = async (companyId: number, transaction?: Transaction): Promise<string[]> => {
  const db = DataBase.instance;
  const company = await db.company.findByPk(companyId, {
    attributes: ["logo_url", "terms_qr_url", "bcp_logo_url", "yape_logo_url"],
    transaction,
  });
  const stores = await db.business_unit.findAll({
    where: { company_id: companyId, logo_url: { [Op.like]: ASSET_PATH_LIKE } },
    attributes: ["logo_url"],
    transaction,
  });
  const variables = await db.variable_general.findAll({
    where: { company_id: companyId, ref2: { [Op.like]: ASSET_PATH_LIKE } },
    attributes: ["ref2"],
    transaction,
  });

  return ownCompanyAssetFileNames(
    [
      company?.logo_url,
      company?.terms_qr_url,
      company?.bcp_logo_url,
      company?.yape_logo_url,
      ...stores.map((store) => store.logo_url),
      ...variables.map((variable) => variable.ref2),
    ],
    companyId
  );
};

// company_id va SIEMPRE en el WHERE: limpiar una empresa jamás alcanza
// imágenes de otra. Separado del service para poder revisar el SQL que arma.
export const buildUnusedAssetsWhere = ({
  companyId,
  referenced,
  replaced,
  abandonedBefore,
}: {
  companyId: number;
  referenced: string[];
  replaced: string[];
  abandonedBefore: Date;
}): WhereOptions<CompanyAssetAttributes> => {
  // Op.notIn con lista vacía arma "NOT IN (NULL)", que no matchea nada: sin
  // referencias, todas las imágenes de la empresa están sin uso.
  const unused: WhereOptions<CompanyAssetAttributes> =
    referenced.length > 0 ? { file_name: { [Op.notIn]: referenced } } : {};
  const abandoned: WhereOptions<CompanyAssetAttributes> = { created_at: { [Op.lt]: abandonedBefore } };
  const removable: WhereOptions<CompanyAssetAttributes> =
    replaced.length > 0 ? { [Op.or]: [abandoned, { file_name: { [Op.in]: replaced } }] } : abandoned;

  return { [Op.and]: [{ company_id: companyId }, unused, removable] };
};

/**
 * Borra las imágenes de UNA empresa que ya no usa ninguna fila (pedido
 * explícito del usuario: "cuando una empresa sube una imagen debe borrar la
 * anterior, si no esas imágenes se quedarán para siempre"):
 * - `replacedPaths` (el logo/QR que se acaba de reemplazar o eliminar): se
 *   borra en el acto si ya nadie lo usa.
 * - Cualquier otra imagen sin uso con más de PENDING_UPLOAD_GRACE_MS: subidas
 *   abandonadas (se eligió un archivo y nunca se guardó).
 * Una ruta ajena en `replacedPaths` se descarta (ownCompanyAssetFileNames).
 */
export const purgeUnusedCompanyAssets = async ({
  companyId,
  replacedPaths = [],
  transaction,
}: {
  companyId: number;
  replacedPaths?: (string | null | undefined)[];
  transaction?: Transaction;
}): Promise<number> => {
  const referenced = await findReferencedFileNames(companyId, transaction);
  const where = buildUnusedAssetsWhere({
    companyId,
    referenced,
    replaced: ownCompanyAssetFileNames(replacedPaths, companyId),
    abandonedBefore: new Date(nowUtc().getTime() - PENDING_UPLOAD_GRACE_MS),
  });

  return DataBase.instance.company_asset.destroy({ where, transaction });
};

import { randomUUID } from "crypto";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { buildCompanyAssetPath, EXTENSION_BY_MIME_TYPE } from "../../../../../middlewares/upload-image";
import { purgeUnusedCompanyAssets } from "../delete/company_asset.service";

// Guarda una imagen de marca de la empresa en la base y devuelve la ruta
// pública con la que se va a referenciar (logo_url, QR de pago).
// El nombre es un UUID nuevo en cada subida: nunca se pisa una imagen
// existente, así que se puede cachear indefinidamente en el navegador.
// En la misma transacción se limpian las subidas abandonadas de la empresa
// (ver purgeUnusedCompanyAssets); la recién subida queda dentro del margen.
export const createCompanyAsset = async ({
  companyId,
  data,
  mimeType,
  createdBy,
}: {
  companyId: number;
  data: Buffer;
  mimeType: string;
  createdBy?: number;
}): Promise<{ path: string }> => {
  const extension = EXTENSION_BY_MIME_TYPE[mimeType] ?? ".png";
  const fileName = `${randomUUID()}${extension}`;

  await DataBase.instance.sequelize.transaction(async (transaction) => {
    await DataBase.instance.company_asset.create(
      {
        id: 0,
        company_id: companyId,
        file_name: fileName,
        mime_type: mimeType,
        size_bytes: data.length,
        data,
        created_by: createdBy ?? null,
        created_at: nowUtc(),
        updated_by: null,
        updated_at: null,
      },
      { transaction }
    );
    await purgeUnusedCompanyAssets({ companyId, transaction });
  });

  return { path: buildCompanyAssetPath(companyId, fileName) };
};

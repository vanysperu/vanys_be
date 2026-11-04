import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { UpdateCompanyDto } from "../../dtos/company.dto";
import { updateCompanyById } from "./company.service";
import { assertCompanyAssetUsable } from "../../../uploads/services/find/company_asset.service";
import { purgeUnusedCompanyAssets } from "../../../uploads/services/delete/company_asset.service";

// Actualiza la empresa y, si cambia el logo, en la MISMA transacción valida el
// nuevo y borra la imagen del anterior (pedido explícito del usuario: "cuando
// una empresa sube una imagen debe borrar la anterior"). Si algo falla, no
// queda ni el logo cambiado ni la imagen borrada.
export const updateCompanyReplacingLogo = async ({
  company,
  companyId,
  updatedBy,
}: {
  company: UpdateCompanyDto;
  companyId: number;
  updatedBy?: number;
}): Promise<[number]> =>
  DataBase.instance.sequelize.transaction(async (transaction) => {
    const current = await DataBase.instance.company.findByPk(companyId, { attributes: ["id", "logo_url"], transaction });
    if (!current) throw new AppError(404, "La empresa no existe");

    const previousLogoUrl = current.logo_url ?? null;
    const changesLogo = company.logo_url !== undefined && company.logo_url !== previousLogoUrl;
    if (changesLogo) await assertCompanyAssetUsable(company.logo_url, companyId, transaction);

    const result = await updateCompanyById({ company, companyId, updatedBy, transaction });
    if (changesLogo) await purgeUnusedCompanyAssets({ companyId, replacedPaths: [previousLogoUrl], transaction });
    return result;
  });

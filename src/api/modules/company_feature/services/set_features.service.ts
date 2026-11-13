import { DataBase } from "../../../../database";
import { AppError } from "../../../../core/errors/AppError";
import { nowUtc } from "../../../../utils/dateUtils";
import { isFeatureCode } from "./shared/feature_catalog";
import { getCompanyFeaturesService } from "./get_features.service";
import type { CompanyFeatureDto } from "../types/company_feature.types";

// Prende o apaga funcionalidades de una empresa (solo Super Administrador).
// Apagar no borra nada: los datos de la funcionalidad quedan, solo se ocultan.
export const setCompanyFeaturesService = async (
  companyId: number,
  changes: Record<string, boolean>,
  actorId: number
): Promise<CompanyFeatureDto[]> => {
  const company = await DataBase.instance.company.findByPk(companyId, { attributes: ["id"] });
  if (!company) throw new AppError(404, "La empresa no existe");

  const unknown = Object.keys(changes).find((code) => !isFeatureCode(code));
  if (unknown) throw new AppError(400, `La funcionalidad "${unknown}" no existe`);

  await DataBase.instance.sequelize.transaction(async (transaction) => {
    const now = nowUtc();
    for (const [featureCode, enabled] of Object.entries(changes)) {
      const existing = await DataBase.instance.company_feature.findOne({
        where: { company_id: companyId, feature_code: featureCode },
        transaction,
      });
      if (existing) {
        if (Boolean(existing.enabled) === enabled) continue;
        await existing.update({ enabled, updated_by: actorId, updated_at: now }, { transaction });
        continue;
      }
      await DataBase.instance.company_feature.create(
        {
          id: 0,
          company_id: companyId,
          feature_code: featureCode,
          enabled,
          settings: null,
          created_by: actorId,
          created_at: now,
          updated_by: actorId,
          updated_at: now,
        },
        { transaction }
      );
    }
  });

  return getCompanyFeaturesService(companyId);
};

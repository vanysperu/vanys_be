import { DataBase } from "../../../../database";
import { AppError } from "../../../../core/errors/AppError";
import { FEATURE_CATALOG } from "./shared/feature_catalog";
import { listEnabledFeatures } from "./shared/feature_store";
import type { CompanyFeatureDto } from "../types/company_feature.types";

// Catálogo completo con el estado de cada funcionalidad para una empresa.
export const getCompanyFeaturesService = async (companyId: number): Promise<CompanyFeatureDto[]> => {
  const company = await DataBase.instance.company.findByPk(companyId, { attributes: ["id"] });
  if (!company) throw new AppError(404, "La empresa no existe");

  const enabled = new Set(await listEnabledFeatures(companyId));
  return FEATURE_CATALOG.map((feature) => ({ ...feature, enabled: enabled.has(feature.code) }));
};

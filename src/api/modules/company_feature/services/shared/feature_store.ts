import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import type { FeatureCode } from "../../types/company_feature.types";
import { isFeatureCode } from "./feature_catalog";

// Códigos de las funcionalidades encendidas de una empresa (una consulta).
export const listEnabledFeatures = async (companyId: number, transaction?: Transaction): Promise<FeatureCode[]> => {
  const rows = await DataBase.instance.company_feature.findAll({
    where: { company_id: companyId, enabled: true },
    attributes: ["feature_code"],
    transaction,
  });
  return rows.map((row) => row.feature_code).filter(isFeatureCode);
};

export const hasCompanyFeature = async (companyId: number, code: FeatureCode, transaction?: Transaction): Promise<boolean> => {
  const row = await DataBase.instance.company_feature.findOne({
    where: { company_id: companyId, feature_code: code, enabled: true },
    attributes: ["id"],
    transaction,
  });
  return row !== null;
};

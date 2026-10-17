import { Op } from "sequelize";
import { DataBase } from "../../../../../database";
import { VariableGeneralModel } from "../../../variable_general/models/variable_general.model";

// Mismo patrón que tax_config.ts (getIgvRate): una fila más de "Variables
// Generales" en vez de una columna/módulo nuevo — una empresa puede
// sobreescribir el estándar global creando su propia fila con esta misma
// categoría+código. Pedido explícito del usuario: "toda cotización solo es
// vigente por 5 días... eso debe ser configurable por empresa... y el
// estándar global de 5 días se usa si la empresa no ha creado el suyo".
export const QUOTATION_CONFIG_CATEGORY = "quotation_config";
export const VALIDITY_DAYS_CODE = "validity_days";

const FALLBACK_VALIDITY_DAYS = 5;

export const getQuotationValidityDays = async (companyId: number | null): Promise<number> => {
  const rows = await DataBase.instance.variable_general.findAll({
    where: {
      category: QUOTATION_CONFIG_CATEGORY,
      prefix_id: VALIDITY_DAYS_CODE,
      [Op.or]: [{ company_id: companyId }, { company_id: null }],
    },
  });

  const companyRow = rows.find((row: VariableGeneralModel) => row.company_id === companyId);
  const globalRow = rows.find((row: VariableGeneralModel) => row.company_id === null);
  const resolved = companyRow ?? globalRow;
  if (!resolved) return FALLBACK_VALIDITY_DAYS;

  const days = Number(resolved.name);
  if (!Number.isFinite(days) || days <= 0) return FALLBACK_VALIDITY_DAYS;

  return days;
};

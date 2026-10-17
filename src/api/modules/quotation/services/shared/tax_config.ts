import { Op } from "sequelize";
import { DataBase } from "../../../../../database";
import { VariableGeneralModel } from "../../../variable_general/models/variable_general.model";

// Misma idea que production_stages.ts: en vez de un módulo/columna nueva
// para un solo número de configuración, se modela como una fila más de
// "Variables Generales" (categoría fija) — una empresa puede sobreescribir
// el valor global creando su propia fila con esta misma categoría+código.
export const TAX_CONFIG_CATEGORY = "tax_config";
export const IGV_RATE_CODE = "igv_rate";

// Si nunca se sembró ni configuró nada (entorno nuevo sin el seeder
// corrido), se cae a este valor — nunca un cálculo que reviente por falta
// de configuración.
const FALLBACK_IGV_RATE = 0.18;

// El valor se guarda como el NÚMERO DEL PORCENTAJE en el campo "name" de la
// fila (ej. "18" = 18%), no la fracción — así la pantalla de Variables
// Generales lo muestra igual de legible que cualquier otro catálogo, sin
// truco de decimales confuso para quien lo edite (18 en vez de 0.18).
export const getIgvRate = async (companyId: number | null): Promise<number> => {
  const rows = await DataBase.instance.variable_general.findAll({
    where: {
      category: TAX_CONFIG_CATEGORY,
      prefix_id: IGV_RATE_CODE,
      [Op.or]: [{ company_id: companyId }, { company_id: null }],
    },
  });

  // Prioriza la fila propia de la empresa sobre la global (mismo criterio
  // que cualquier config "override por tenant").
  const companyRow = rows.find((row: VariableGeneralModel) => row.company_id === companyId);
  const globalRow = rows.find((row: VariableGeneralModel) => row.company_id === null);
  const resolved = companyRow ?? globalRow;
  if (!resolved) return FALLBACK_IGV_RATE;

  const percentage = Number(resolved.name);
  if (!Number.isFinite(percentage) || percentage < 0) return FALLBACK_IGV_RATE;

  return percentage / 100;
};

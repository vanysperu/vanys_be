import { Op, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { VariableGeneralModel } from "../../../variable_general/models/variable_general.model";

// Categoría fija bajo la que viven las etapas de producción dentro de
// general_variable (pantalla "Variables Generales", ver CLAUDE.md sección
// 2 — un módulo nuevo por cada catálogo pequeño no escala). Cada fila es
// global (company_id null) o propia de una empresa; ambas conviven.
export const PRODUCTION_STAGE_CATEGORY = "production_stage";

// Las etapas de una empresa = las globales + las que ella misma agregó,
// ordenadas por `ref2` (posición). ref2 se guarda como string en
// general_variable, así que se castea a número acá para no depender de un
// orden lexicográfico ("10" < "2" como texto).
export const getOrderedProductionStages = async (companyId: number, transaction?: Transaction) => {
  const rows = await DataBase.instance.variable_general.findAll({
    where: {
      category: PRODUCTION_STAGE_CATEGORY,
      [Op.or]: [{ company_id: companyId }, { company_id: null }],
    },
    transaction,
  });

  return [...rows].sort(
    (a: VariableGeneralModel, b: VariableGeneralModel) => Number(a.ref2 ?? 0) - Number(b.ref2 ?? 0)
  );
};

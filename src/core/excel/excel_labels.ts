import { Op } from "sequelize";
import { DataBase } from "../../database";

// Nombres visibles de catálogos de Variables Generales (tipos de movimiento,
// métodos de pago...) por su código, para que el Excel diga "Yape" y no
// "yape". La fila de la empresa pisa a la global con el mismo código.
export async function loadGeneralVariableNames(category: string, companyId: number | null): Promise<Map<string, string>> {
  const rows = await DataBase.instance.variable_general.findAll({
    where: {
      category,
      ...(companyId === null ? {} : { company_id: { [Op.or]: [null, companyId] } }),
    },
    attributes: ["prefix_id", "name", "company_id"],
  });
  const globalsFirst = [...rows].sort((a, b) => (a.company_id === null ? 0 : 1) - (b.company_id === null ? 0 : 1));
  return new Map(globalsFirst.map((row) => [row.prefix_id, row.name]));
}

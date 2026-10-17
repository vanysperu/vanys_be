import { DataBase } from "../../../../../database";

// companyId=null (solo para llamadas is_system) omite el filtro de tenant.
export async function deleteVariableGeneralById(id: number, companyId: number | null) {
  const model = DataBase.instance.variable_general;
  const where: Record<string, unknown> = { id };
  if (companyId !== null) where.company_id = companyId;

  return model.destroy({ where });
}



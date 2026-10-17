import { DataBase } from "../../../../../database";
import { VariableGeneralPartialAttributes } from "../../models/variable_general.model";

// companyId=null (solo para llamadas is_system) omite el filtro de tenant.
// Sin este WHERE, cualquier usuario autenticado podía editar por ID una
// variable general de OTRA empresa con solo adivinar/conocer su id.
export async function updateVariableGeneralById(
  id: number,
  payload: VariableGeneralPartialAttributes,
  companyId: number | null
) {
  const model = DataBase.instance.variable_general;
  const where: Record<string, unknown> = { id };
  if (companyId !== null) where.company_id = companyId;

  return model.update(
    {
      category: payload.category,
      title: payload.title,
      prefix_id: payload.prefix_id,
      name: payload.name,
      description: payload.description,
      ref1: payload.ref1,
      ref2: payload.ref2,
    },
    { where }
  );
}



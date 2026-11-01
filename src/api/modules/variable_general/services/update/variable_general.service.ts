import { DataBase } from "../../../../../database";
import { VariableGeneralPartialAttributes } from "../../models/variable_general.model";
import { AppError } from "../../../../../core/errors/AppError";
import { PAYMENT_ACCOUNT_CATEGORY } from "../shared/payment_account.service";

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

  // Una cuenta de pago no cambia de categoría: dejaría de ser cuenta para
  // los pagos y movimientos que la usan (Caja perdería de dónde vino el
  // dinero). Para dejar de usarla, se deshabilita.
  const current = await model.findOne({ where });
  const changesCategory = payload.category !== undefined && payload.category !== current?.category;
  if (current?.category === PAYMENT_ACCOUNT_CATEGORY && changesCategory) {
    throw new AppError(400, "Una cuenta de pago no puede cambiar de categoría. Si ya no se usa, deshabilítala.");
  }

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



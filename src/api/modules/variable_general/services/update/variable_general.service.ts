import { DataBase } from "../../../../../database";
import { VariableGeneralPartialAttributes } from "../../models/variable_general.model";
import { AppError } from "../../../../../core/errors/AppError";
import { PAYMENT_ACCOUNT_CATEGORY } from "../shared/payment_account.service";
import { assertCompanyAssetUsable } from "../../../uploads/services/find/company_asset.service";
import { purgeUnusedCompanyAssets } from "../../../uploads/services/delete/company_asset.service";

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

  // Si cambia ref2 (QR de una cuenta de pago), el nuevo tiene que ser una
  // imagen vigente de la empresa y la imagen anterior se borra en la misma
  // transacción (pedido explícito del usuario: no dejar imágenes huérfanas).
  const ownerCompanyId = current?.company_id ?? null;
  const replacesRef2 = current !== null && payload.ref2 !== undefined && payload.ref2 !== current.ref2;
  if (replacesRef2) await assertCompanyAssetUsable(payload.ref2, ownerCompanyId);

  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const result = await model.update(
      {
        category: payload.category,
        title: payload.title,
        prefix_id: payload.prefix_id,
        name: payload.name,
        description: payload.description,
        ref1: payload.ref1,
        ref2: payload.ref2,
      },
      { where, transaction }
    );
    if (replacesRef2 && ownerCompanyId !== null) {
      await purgeUnusedCompanyAssets({ companyId: ownerCompanyId, replacedPaths: [current?.ref2], transaction });
    }
    return result;
  });
}



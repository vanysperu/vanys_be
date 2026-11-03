import { DataBase } from "../../../../../database";
import {
  assertPaymentAccountCanBeRemoved,
  PAYMENT_ACCOUNT_CATEGORY,
} from "../shared/payment_account.service";
import { purgeUnusedCompanyAssets } from "../../../uploads/services/delete/company_asset.service";

// companyId=null (solo para llamadas is_system) omite el filtro de tenant.
export async function deleteVariableGeneralById(id: number, companyId: number | null) {
  const model = DataBase.instance.variable_general;
  const where: Record<string, unknown> = { id };
  if (companyId !== null) where.company_id = companyId;

  // Una cuenta de pago con movimientos no se borra: su historial en Caja
  // pasaría a "Efectivo" (ver assertPaymentAccountCanBeRemoved).
  const row = await model.findOne({ where });
  if (row?.category === PAYMENT_ACCOUNT_CATEGORY) await assertPaymentAccountCanBeRemoved(id);

  // El QR de la fila eliminada ya no lo usa nadie: se borra en la misma
  // transacción (deshabilitar no lo borra: la fila sigue y puede volver).
  const ownerCompanyId = row?.company_id ?? null;
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const deleted = await model.destroy({ where, transaction });
    if (deleted > 0 && ownerCompanyId !== null) {
      await purgeUnusedCompanyAssets({ companyId: ownerCompanyId, replacedPaths: [row?.ref2], transaction });
    }
    return deleted;
  });
}

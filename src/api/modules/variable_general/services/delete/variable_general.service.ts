import { DataBase } from "../../../../../database";
import {
  assertPaymentAccountCanBeRemoved,
  PAYMENT_ACCOUNT_CATEGORY,
} from "../shared/payment_account.service";
import { loadManageableVariable } from "../shared/variable_scope.service";
import { purgeUnusedCompanyAssets } from "../../../uploads/services/delete/company_asset.service";

// companyId=null (solo para llamadas is_system) omite el filtro de tenant.
// Una fila global (company_id NULL) solo la elimina un is_system: para los
// demás lanza 403.
export async function deleteVariableGeneralById(id: number, companyId: number | null): Promise<number> {
  const row = await loadManageableVariable(id, companyId);
  // Inexistente o de otra empresa: el controller responde 404.
  if (!row) return 0;

  const where: Record<string, unknown> = { id };
  if (companyId !== null) where.company_id = companyId;

  // Una cuenta de pago con movimientos no se borra: su historial en Caja
  // pasaría a "Efectivo" (ver assertPaymentAccountCanBeRemoved).
  if (row.category === PAYMENT_ACCOUNT_CATEGORY) await assertPaymentAccountCanBeRemoved(id);

  // El QR de la fila eliminada ya no lo usa nadie: se borra en la misma
  // transacción (deshabilitar no lo borra: la fila sigue y puede volver).
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const deleted = await DataBase.instance.variable_general.destroy({ where, transaction });
    if (deleted > 0 && row.company_id !== null) {
      await purgeUnusedCompanyAssets({ companyId: row.company_id, replacedPaths: [row.ref2], transaction });
    }
    return deleted;
  });
}

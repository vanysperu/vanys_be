import { DataBase } from "../../../../../database";
import {
  assertPaymentAccountCanBeRemoved,
  PAYMENT_ACCOUNT_CATEGORY,
} from "../shared/payment_account.service";
import { loadManageableVariable } from "../shared/variable_scope.service";

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

  return DataBase.instance.variable_general.destroy({ where });
}

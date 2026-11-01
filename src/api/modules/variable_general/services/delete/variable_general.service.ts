import { DataBase } from "../../../../../database";
import {
  assertPaymentAccountCanBeRemoved,
  PAYMENT_ACCOUNT_CATEGORY,
} from "../shared/payment_account.service";

// companyId=null (solo para llamadas is_system) omite el filtro de tenant.
export async function deleteVariableGeneralById(id: number, companyId: number | null) {
  const model = DataBase.instance.variable_general;
  const where: Record<string, unknown> = { id };
  if (companyId !== null) where.company_id = companyId;

  // Una cuenta de pago con movimientos no se borra: su historial en Caja
  // pasaría a "Efectivo" (ver assertPaymentAccountCanBeRemoved).
  const row = await model.findOne({ where });
  if (row?.category === PAYMENT_ACCOUNT_CATEGORY) await assertPaymentAccountCanBeRemoved(id);

  return model.destroy({ where });
}

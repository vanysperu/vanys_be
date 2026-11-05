import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { InvoiceModel } from "../../model/invoice.model";
import { InvoiceActor } from "../../types/invoice.types";

const notFound = () => new AppError(404, "La factura no existe", undefined, "INVOICE_NOT_FOUND");

/**
 * Factura que el usuario puede ver o completar. Otra empresa, u otra tienda
 * si el usuario está atado a la suya, responde igual que una que no existe
 * (404). El Super Administrador ve todas.
 */
export async function loadInvoiceForActor(
  id: number,
  actor: InvoiceActor,
  transaction?: Transaction
): Promise<InvoiceModel> {
  const invoice = await DataBase.instance.invoice.findOne({
    where: { id },
    transaction,
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
  });
  if (!invoice) throw notFound();
  if (actor.isSystem) return invoice;
  if (Number(invoice.company_id) !== actor.companyId) throw notFound();
  const outOfStore =
    actor.businessUnitId !== undefined && invoice.business_unit_id !== null && Number(invoice.business_unit_id) !== actor.businessUnitId;
  if (outOfStore) throw notFound();
  return invoice;
}

import { DataBase } from "../../../../database";
import { AppError } from "../../../../core/errors/AppError";
import { nowUtc } from "../../../../utils/dateUtils";
import { InvoiceActor, InvoiceDetailsInput } from "../types/invoice.types";
import { assertNotDuplicateInvoice, resolveInvoiceDetails } from "./shared/invoice_details";
import { loadInvoiceForActor } from "./shared/invoice_scope";

/**
 * Completa o corrige los datos de una factura de compra (D9: proveedor,
 * serie-número, fecha de emisión, moneda y total; todos opcionales). Avisa si
 * se repite proveedor + serie-número, salvo que la persona lo confirme.
 */
export async function updateInvoiceDetailsService(
  invoiceId: number,
  input: InvoiceDetailsInput,
  allowDuplicate: boolean,
  actor: InvoiceActor
): Promise<{ id: number }> {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const invoice = await loadInvoiceForActor(invoiceId, actor, transaction);
    if (invoice.type !== "purchase") {
      throw new AppError(400, "Solo las facturas de compra llevan proveedor y número", undefined, "INVOICE_NOT_PURCHASE");
    }
    const companyId = Number(invoice.company_id);
    const details = await resolveInvoiceDetails(input, companyId, transaction);
    await assertNotDuplicateInvoice({ companyId, details, exceptInvoiceId: invoiceId, allowDuplicate, transaction });
    await invoice.update(
      {
        supplier_id: details.supplierId ?? null,
        series_number: details.seriesNumber ?? null,
        issue_date: details.issueDate ?? null,
        currency: details.currency ?? null,
        total: details.total ?? null,
        updated_by: actor.userId,
        updated_at: nowUtc(),
      },
      { transaction }
    );
    return { id: invoiceId };
  });
}

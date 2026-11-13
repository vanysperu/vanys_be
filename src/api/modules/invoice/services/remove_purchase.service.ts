import { DataBase } from "../../../../database";
import { AppError } from "../../../../core/errors/AppError";
import { nowUtc } from "../../../../utils/dateUtils";
import { logQuotationEvent } from "../../quotation/services/timeline/quotation_event.service";
import { InvoiceActor } from "../types/invoice.types";
import { loadInvoiceForActor } from "./shared/invoice_scope";
import { reconcileInvoiceAfterRemoval } from "./shared/purchase_invoice_link";
import { lockPurchasesForActor } from "./shared/purchase_scope";

/**
 * "Quitar compra" desde la factura (plan §4, punto 5): la compra vuelve a la
 * bandeja con la factura pendiente. Valen las reglas de una factura que se
 * queda sin compras (igual que al anular una compra): si no le queda ninguna
 * y no tiene archivo, se borra; con archivo se conserva (el documento real
 * existe). Sin motivo: no mueve dinero.
 */
export async function removeInvoicePurchaseService(
  invoiceId: number,
  purchaseId: number,
  actor: InvoiceActor
): Promise<{ invoice_deleted: boolean }> {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const invoice = await loadInvoiceForActor(invoiceId, actor, transaction);
    const [purchase] = await lockPurchasesForActor([purchaseId], actor, transaction);
    if (!purchase || purchase.linked_invoice_id !== Number(invoice.id)) {
      throw new AppError(404, "La compra no está en esta factura", undefined, "PURCHASE_NOT_IN_INVOICE");
    }

    await DataBase.instance.invoice_purchase.destroy({ where: { invoice_id: invoiceId, purchase_id: purchaseId }, transaction });
    // Una compra anulada no vuelve a la bandeja (nunca aparece ahí).
    await DataBase.instance.purchase_order_item_purchase.update(
      { invoice_status: "pending", updated_by: actor.userId, updated_at: nowUtc() },
      { where: { id: purchaseId }, transaction }
    );
    const label = invoice.series_number ? `la factura ${invoice.series_number}` : `la factura #${invoice.id}`;
    await logQuotationEvent({
      quotationId: purchase.quotation_id,
      action: "purchase_invoice_unlinked",
      description: `Compra quitada de ${label}: ${purchase.product_name} × ${purchase.quantity}`,
      actorId: actor.userId,
      transaction,
    });
    const deleted = await reconcileInvoiceAfterRemoval({ invoiceId, keepIfHasFile: true, actorId: actor.userId, transaction });
    return { invoice_deleted: deleted };
  });
}

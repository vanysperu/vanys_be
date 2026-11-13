import { Transaction } from "sequelize";
import { DataBase } from "../../../../database";
import { AppError } from "../../../../core/errors/AppError";
import { nowUtc } from "../../../../utils/dateUtils";
import { logQuotationEvent } from "../../quotation/services/timeline/quotation_event.service";
import { InvoiceModel } from "../model/invoice.model";
import { InvoiceActor, LinkPurchasesInput, LinkPurchasesResult } from "../types/invoice.types";
import { assertNotDuplicateInvoice, resolveInvoiceDetails } from "./shared/invoice_details";
import { loadInvoiceForActor } from "./shared/invoice_scope";
import { LockedPurchase, lockPurchasesForActor } from "./shared/purchase_scope";
import { createPurchaseLink, registerInvoice } from "./shared/register_invoice";

const linesText = (purchases: LockedPurchase[]) => purchases.map((purchase) => `${purchase.product_name} × ${purchase.quantity}`).join(", ");

const assertLinkable = (purchases: LockedPurchase[]) => {
  if (purchases.some((purchase) => purchase.is_deleted)) {
    throw new AppError(409, "Una compra anulada no lleva factura", undefined, "PURCHASE_ANNULLED");
  }
  if (purchases.some((purchase) => purchase.linked_invoice_id !== null)) {
    throw new AppError(409, "Alguna de las compras ya está en una factura", undefined, "PURCHASE_ALREADY_INVOICED");
  }
  const companies = new Set(purchases.map((purchase) => purchase.company_id));
  if (companies.size > 1) throw new AppError(400, "Las compras son de empresas distintas", undefined, "PURCHASES_MIXED_COMPANIES");
};

// Factura ya registrada: de compra, de la empresa de las compras y, si el
// usuario está atado a una tienda, de su tienda (nunca una de varias tiendas).
const loadTargetInvoice = async (invoiceId: number, companyId: number, actor: InvoiceActor, transaction: Transaction): Promise<InvoiceModel> => {
  const invoice = await loadInvoiceForActor(invoiceId, actor, transaction);
  const storeId = invoice.business_unit_id === null ? null : Number(invoice.business_unit_id);
  const foreignStore = actor.writeBusinessUnitId !== undefined && storeId !== actor.writeBusinessUnitId;
  if (invoice.type !== "purchase" || Number(invoice.company_id) !== companyId || foreignStore) {
    throw new AppError(400, "La factura elegida no es una factura de compra a la que puedas sumar estas compras", undefined, "INVOICE_NOT_LINKABLE");
  }
  return invoice;
};

// Un evento por cotización en su historial (no es una corrección de dinero:
// vincular la factura no mueve plata, plan §4 punto 4).
const logLinkEvents = async (purchases: LockedPurchase[], invoiceLabel: string, actorId: number, transaction: Transaction) => {
  const byQuotation = new Map<number, LockedPurchase[]>();
  for (const purchase of purchases) byQuotation.set(purchase.quotation_id, [...(byQuotation.get(purchase.quotation_id) ?? []), purchase]);
  for (const [quotationId, lines] of byQuotation) {
    await logQuotationEvent({
      quotationId,
      action: "purchase_invoice_linked",
      description: `${invoiceLabel}: ${linesText(lines)}`,
      actorId,
      transaction,
    });
  }
};

/**
 * Registra UNA factura para varias compras, o las suma a una ya registrada
 * (plan §4, puntos 3 y 4: "Registrar factura" desde la bandeja y "Vincular
 * factura" en cada compra). Sin motivo y sin pasar por "Corregir compra".
 * Todo en una transacción: si una compra no se puede vincular, no queda
 * ninguna vinculada ni la factura creada.
 *
 * Varias tiendas (D8): un admin de empresa puede juntar compras de varias
 * tiendas (la factura queda sin tienda); un usuario atado a una tienda solo
 * junta las de la suya (lockPurchasesForActor ya lo valida).
 */
export async function linkPurchasesService(input: LinkPurchasesInput, actor: InvoiceActor): Promise<LinkPurchasesResult> {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const purchases = await lockPurchasesForActor(input.purchaseIds, actor, transaction);
    assertLinkable(purchases);
    const [first, ...rest] = purchases;
    if (!first) throw new AppError(400, "Elige al menos una compra");
    const companyId = first.company_id;
    const stores = new Set(purchases.map((purchase) => purchase.business_unit_id));

    if (input.invoiceId !== undefined) {
      const invoice = await loadTargetInvoice(input.invoiceId, companyId, actor, transaction);
      for (const purchase of purchases) {
        await createPurchaseLink({ invoiceId: Number(invoice.id), purchaseId: purchase.id, companyId, actorId: actor.userId, transaction });
      }
      const invoiceStore = invoice.business_unit_id === null ? null : Number(invoice.business_unit_id);
      // Al sumarle compras de otra tienda, la factura pasa a ser "de varias tiendas".
      const mixesStores = invoiceStore !== null && [...stores].some((store) => store !== invoiceStore);
      await invoice.update(
        { ...(mixesStores ? { business_unit_id: null } : {}), updated_by: actor.userId, updated_at: nowUtc() },
        { transaction }
      );
      const label = invoice.series_number ? `Compra vinculada a la factura ${invoice.series_number}` : `Compra vinculada a la factura #${invoice.id}`;
      await logLinkEvents(purchases, label, actor.userId, transaction);
      return { invoice_id: Number(invoice.id), created: false, linked_purchase_ids: purchases.map((purchase) => purchase.id) };
    }

    const details = await resolveInvoiceDetails(input.details, companyId, transaction);
    await assertNotDuplicateInvoice({ companyId, details, exceptInvoiceId: null, allowDuplicate: input.allowDuplicate, transaction });
    const invoiceId = await registerInvoice({
      companyId,
      businessUnitId: stores.size === 1 ? first.business_unit_id : null,
      type: "purchase",
      quotationId: first.quotation_id,
      purchaseId: first.id,
      description: `${first.product_name} × ${first.quantity}`,
      details,
      actorId: actor.userId,
      transaction,
    });
    for (const purchase of rest) {
      await createPurchaseLink({ invoiceId, purchaseId: purchase.id, companyId, actorId: actor.userId, transaction });
    }
    await logLinkEvents(purchases, details.seriesNumber ? `Factura ${details.seriesNumber} registrada` : "Factura registrada", actor.userId, transaction);
    return { invoice_id: invoiceId, created: true, linked_purchase_ids: purchases.map((purchase) => purchase.id) };
  });
}

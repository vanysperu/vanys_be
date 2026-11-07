import { QueryTypes, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { linkPurchaseToInvoice, registerInvoice } from "./register_invoice";

// Largo de la columna invoice.description.
const DESCRIPTION_MAX = 255;

interface FirstPurchaseRow {
  product_name: string;
  quantity: number | string;
  quotation_id: number | string;
}

// Qué pidió la persona sobre la factura al corregir una compra.
export interface PurchaseInvoiceRequest {
  hasInvoice?: boolean;
  invoiceId?: number | null;
}

export type PurchaseInvoiceChange =
  | { kind: "none" }
  | { kind: "remove" } // ya no lleva factura
  | { kind: "create" } // factura nueva
  | { kind: "move"; invoiceId: number }; // va en otra factura ya registrada

export const findInvoiceIdOfPurchase = async (purchaseId: number, transaction: Transaction): Promise<number | null> => {
  const link = await DataBase.instance.invoice_purchase.findOne({
    where: { purchase_id: purchaseId },
    attributes: ["invoice_id"],
    transaction,
  });
  return link ? Number(link.invoice_id) : null;
};

// Primera compra VIGENTE que le queda a una factura (null si ninguna).
const firstLivePurchase = async (invoiceId: number, transaction: Transaction): Promise<FirstPurchaseRow | null> => {
  const [row] = (await DataBase.instance.sequelize.query(
    `SELECT pr.name AS product_name, pop.quantity, po.quotation_id
     FROM invoice_purchase ip
     INNER JOIN purchase_order_item_purchase pop ON pop.id = ip.purchase_id
     INNER JOIN purchase_order_item poi ON poi.id = pop.purchase_order_item_id
     INNER JOIN purchase_order po ON po.id = poi.purchase_order_id
     INNER JOIN quotation_item qi ON qi.id = poi.quotation_item_id
     INNER JOIN product pr ON pr.id = qi.product_id
     WHERE ip.invoice_id = :invoiceId AND pop.is_deleted = false
     ORDER BY ip.id ASC
     LIMIT 1`,
    { type: QueryTypes.SELECT, replacements: { invoiceId }, transaction }
  )) as FirstPurchaseRow[];
  return row ?? null;
};

/**
 * Deja coherente una factura de compra después de sacarle compras:
 *   - si le quedan compras vigentes, su cotización principal y su texto pasan
 *     a ser los de la primera que queda (si no, seguiría figurando una
 *     cotización que ya no cubre);
 *   - si no le queda ninguna, se borra: una factura sin compras no es nada y
 *     quedaría para siempre en "Faltan subir". Con `keepIfHasFile` se conserva
 *     si ya tiene archivo (una compra devuelta igual tuvo su factura real).
 *
 * Borrarla quita su archivo del sistema (invoice_file, en cascada); lo copiado
 * a Google Drive no se toca nunca. Devuelve true si la borró.
 */
export async function reconcileInvoiceAfterRemoval({
  invoiceId,
  keepIfHasFile,
  actorId,
  transaction,
}: {
  invoiceId: number;
  keepIfHasFile: boolean;
  actorId: number | null;
  transaction: Transaction;
}): Promise<boolean> {
  const invoice = await DataBase.instance.invoice.findOne({ where: { id: invoiceId }, transaction, lock: transaction.LOCK.UPDATE });
  if (!invoice) return false;

  const first = await firstLivePurchase(invoiceId, transaction);
  if (first) {
    await invoice.update(
      {
        quotation_id: Number(first.quotation_id),
        description: `${first.product_name} × ${first.quantity}`.slice(0, DESCRIPTION_MAX),
        updated_by: actorId,
        updated_at: nowUtc(),
      },
      { transaction }
    );
    return false;
  }

  if (keepIfHasFile && invoice.file_name !== null) return false;
  await invoice.destroy({ transaction });
  return true;
}

// Traduce lo pedido al cambio real, según la factura que tiene hoy la compra.
export const resolvePurchaseInvoiceChange = (
  request: PurchaseInvoiceRequest,
  currentInvoiceId: number | null
): PurchaseInvoiceChange => {
  if (request.hasInvoice === undefined) return { kind: "none" };
  if (!request.hasInvoice) return currentInvoiceId === null ? { kind: "none" } : { kind: "remove" };

  const target = request.invoiceId ?? null;
  if (target !== null) return target === currentInvoiceId ? { kind: "none" } : { kind: "move", invoiceId: target };
  return currentInvoiceId === null ? { kind: "create" } : { kind: "none" };
};

/**
 * Aplica el cambio de factura de una compra, en la transacción de la corrección
 * (si algo falla, la compra y la factura quedan como estaban). Devuelve la
 * factura con la que queda la compra.
 *
 * Al sacarla de una factura que se queda sin compras, esa factura se borra aun
 * con archivo: la persona está diciendo que la compra no iba ahí (el diálogo
 * lo avisa antes de confirmar). Así también se unen dos facturas que eran una.
 */
export async function applyPurchaseInvoiceChange({
  change,
  currentInvoiceId,
  purchaseId,
  companyId,
  businessUnitId,
  quotationId,
  description,
  actorId,
  transaction,
}: {
  change: PurchaseInvoiceChange;
  currentInvoiceId: number | null;
  purchaseId: number;
  companyId: number;
  businessUnitId: number | null;
  quotationId: number;
  description: string;
  actorId: number | null;
  transaction: Transaction;
}): Promise<number | null> {
  if (change.kind === "none") return currentInvoiceId;
  if (change.kind === "create") {
    return registerInvoice({ companyId, businessUnitId, type: "purchase", quotationId, purchaseId, description, actorId, transaction });
  }

  if (currentInvoiceId !== null) await DataBase.instance.invoice_purchase.destroy({ where: { purchase_id: purchaseId }, transaction });
  if (change.kind === "move") {
    await linkPurchaseToInvoice({ invoiceId: change.invoiceId, purchaseId, companyId, businessUnitId, actorId, transaction });
  }
  if (currentInvoiceId !== null) {
    await reconcileInvoiceAfterRemoval({ invoiceId: currentInvoiceId, keepIfHasFile: false, actorId, transaction });
  }
  return change.kind === "move" ? change.invoiceId : null;
}

// Texto del historial: antes y después de la factura de una compra.
export const invoiceStatusTexts = (
  change: PurchaseInvoiceChange,
  currentInvoiceId: number | null
): { before: string; after: string } => {
  const before = currentInvoiceId === null ? "Sin factura" : "Con factura";
  if (change.kind === "remove") return { before, after: "Sin factura" };
  if (change.kind === "move" && currentInvoiceId !== null) return { before, after: "En otra factura" };
  return { before, after: "Con factura" };
};

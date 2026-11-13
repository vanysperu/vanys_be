import { QueryTypes, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { PurchaseInvoiceStatus } from "../../../purchase_order/model/purchase_order_item_purchase.model";
import { InvoiceActor } from "../../types/invoice.types";

export interface LockedPurchase {
  id: number;
  is_deleted: boolean;
  invoice_status: PurchaseInvoiceStatus;
  company_id: number;
  business_unit_id: number | null;
  quotation_id: number;
  product_name: string;
  quantity: number;
  linked_invoice_id: number | null;
}

interface LockedPurchaseRow {
  id: number | string;
  is_deleted: number | boolean;
  invoice_status: PurchaseInvoiceStatus;
  company_id: number | string;
  business_unit_id: number | string | null;
  quotation_id: number | string;
  product_name: string;
  quantity: number | string;
  linked_invoice_id: number | string | null;
}

const notFound = () => new AppError(404, "Alguna de las compras no existe", undefined, "PURCHASE_NOT_FOUND");

/**
 * Bloquea (FOR UPDATE) las compras pedidas y valida que el usuario pueda
 * escribir sobre todas: misma empresa (o Super Administrador) y, si está
 * atado a una tienda, solo compras de su tienda (D8). Una compra ajena
 * responde igual que una que no existe (404).
 */
export async function lockPurchasesForActor(
  purchaseIds: number[],
  actor: InvoiceActor,
  transaction: Transaction
): Promise<LockedPurchase[]> {
  const rows = (await DataBase.instance.sequelize.query(
    `SELECT pop.id, pop.is_deleted, pop.invoice_status, po.company_id, q.business_unit_id, po.quotation_id,
            pr.name AS product_name, pop.quantity, ip.invoice_id AS linked_invoice_id
     FROM purchase_order_item_purchase pop
     INNER JOIN purchase_order_item poi ON poi.id = pop.purchase_order_item_id
     INNER JOIN purchase_order po ON po.id = poi.purchase_order_id
     INNER JOIN quotation q ON q.id = po.quotation_id
     INNER JOIN quotation_item qi ON qi.id = poi.quotation_item_id
     INNER JOIN product pr ON pr.id = qi.product_id
     LEFT JOIN invoice_purchase ip ON ip.purchase_id = pop.id
     WHERE pop.id IN (:purchaseIds)
     ORDER BY pop.id ASC
     FOR UPDATE OF pop`,
    { type: QueryTypes.SELECT, replacements: { purchaseIds }, transaction }
  )) as LockedPurchaseRow[];
  if (rows.length !== new Set(purchaseIds).size) throw notFound();

  const purchases = rows.map((row) => ({
    id: Number(row.id),
    is_deleted: Boolean(row.is_deleted),
    invoice_status: row.invoice_status,
    company_id: Number(row.company_id),
    business_unit_id: row.business_unit_id === null ? null : Number(row.business_unit_id),
    quotation_id: Number(row.quotation_id),
    product_name: row.product_name,
    quantity: Number(row.quantity),
    linked_invoice_id: row.linked_invoice_id === null ? null : Number(row.linked_invoice_id),
  }));

  const outOfScope = (purchase: LockedPurchase) =>
    (!actor.isSystem && purchase.company_id !== actor.companyId) ||
    (actor.writeBusinessUnitId !== undefined && purchase.business_unit_id !== actor.writeBusinessUnitId);
  if (purchases.some(outOfScope)) throw notFound();
  return purchases;
}

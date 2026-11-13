import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";
import { InvoicePurchaseLine } from "../../types/invoice.types";
import { quotationCode } from "./drive_copy";

interface PurchaseLineRow {
  invoice_id: number | string;
  purchase_id: number | string;
  product_name: string;
  quantity: number | string;
  amount: number | string;
  quotation_id: number | string;
}

// Filtro de búsqueda sobre las compras de una factura (alias `i`): por
// cualquiera de sus productos o cotizaciones, no solo por la primera compra.
// Texto fijo; usa los replacements :search y :searchId del llamador.
export const INVOICE_PURCHASE_SEARCH_SQL = `EXISTS (
  SELECT 1 FROM invoice_purchase sip
  INNER JOIN purchase_order_item_purchase spop ON spop.id = sip.purchase_id
  INNER JOIN purchase_order_item spoi ON spoi.id = spop.purchase_order_item_id
  INNER JOIN purchase_order spo ON spo.id = spoi.purchase_order_id
  INNER JOIN quotation_item sqi ON sqi.id = spoi.quotation_item_id
  INNER JOIN product spr ON spr.id = sqi.product_id
  WHERE sip.invoice_id = i.id AND (spr.name LIKE :search OR CAST(spo.quotation_id AS CHAR) = :searchId))`;

// Condición completa de búsqueda de una factura (alias `i`). Lo mismo en
// Facturas y en el selector de facturas al registrar una compra.
// También por serie-número y por proveedor (Sprint 2, ítem 3, D9).
export const INVOICE_SEARCH_SQL = `(i.description LIKE :search OR CAST(i.quotation_id AS CHAR) = :searchId OR i.series_number LIKE :search
  OR EXISTS (SELECT 1 FROM supplier ssu WHERE ssu.id = i.supplier_id AND (ssu.name LIKE :search OR ssu.document_number LIKE :search))
  OR ${INVOICE_PURCHASE_SEARCH_SQL})`;

// Texto y número de la búsqueda ("COT-0012" -> "12") para los replacements.
export const invoiceSearchReplacements = (search: string | undefined) => ({
  search: search ? `%${search}%` : null,
  searchId: (search ?? "").replace(/\D/g, "").replace(/^0+/, "") || null,
});

/**
 * Compras vigentes de cada factura (una factura puede cubrir varios productos),
 * en una sola consulta para toda la página. Una compra anulada deja de
 * listarse, igual que deja de contar en Caja.
 */
export async function loadInvoicePurchases(invoiceIds: number[]): Promise<Map<number, InvoicePurchaseLine[]>> {
  if (invoiceIds.length === 0) return new Map();
  const rows = (await DataBase.instance.sequelize.query(
    `SELECT ip.invoice_id, ip.purchase_id, pr.name AS product_name, pop.quantity, qe.amount, po.quotation_id
     FROM invoice_purchase ip
     INNER JOIN purchase_order_item_purchase pop ON pop.id = ip.purchase_id
     INNER JOIN quotation_expense qe ON qe.id = pop.quotation_expense_id
     INNER JOIN purchase_order_item poi ON poi.id = pop.purchase_order_item_id
     INNER JOIN purchase_order po ON po.id = poi.purchase_order_id
     INNER JOIN quotation_item qi ON qi.id = poi.quotation_item_id
     INNER JOIN product pr ON pr.id = qi.product_id
     WHERE ip.invoice_id IN (:invoiceIds) AND pop.is_deleted = false
     ORDER BY ip.id ASC`,
    { type: QueryTypes.SELECT, replacements: { invoiceIds } }
  )) as PurchaseLineRow[];

  const byInvoice = new Map<number, InvoicePurchaseLine[]>();
  for (const row of rows) {
    const invoiceId = Number(row.invoice_id);
    const line: InvoicePurchaseLine = {
      purchase_id: Number(row.purchase_id),
      product_name: row.product_name,
      quantity: Number(row.quantity),
      amount: Number(row.amount),
      quotation_code: quotationCode(Number(row.quotation_id)),
    };
    byInvoice.set(invoiceId, [...(byInvoice.get(invoiceId) ?? []), line]);
  }
  return byInvoice;
}

// "Taza × 10, Polo × 5". Sin compras vigentes (una emitida, o todas anuladas),
// el texto guardado de la factura.
export const invoiceDescription = (stored: string, purchases: InvoicePurchaseLine[]): string =>
  purchases.length === 0 ? stored : purchases.map((line) => `${line.product_name} × ${line.quantity}`).join(", ");

// Cotizaciones que cubre la factura, sin repetir. La principal va siempre,
// también si sus compras se anularon.
export const invoiceQuotationCodes = (quotationId: number, purchases: InvoicePurchaseLine[]): string[] => [
  ...new Set([quotationCode(quotationId), ...purchases.map((line) => line.quotation_code)]),
];

import { assertExportSize, EXPORT_MAX_ROWS } from "../../../../../core/excel/excel_export";
import { ExcelSheet } from "../../../../../core/excel/excel_export.types";
import { excelDateTimeParts, excelMoney, quotationCodeOf } from "../../../../../core/excel/excel_format";
import { getPurchaseOrdersList, PurchaseOrderListFilter, PurchaseOrderWithItems } from "../find/purchase_order.service";

const ORDER_STATUS_LABEL: Record<string, string> = { pending: "Pendiente", purchased: "Comprada" };
const ITEM_STATUS_LABEL: Record<string, string> = { pending: "Por comprar", purchased: "Comprado", not_needed: "No hace falta" };

interface OrderRelations {
  quotation?: { client?: { name: string } | null } | null;
  assignee?: { name: string | null; paternal_lastname: string | null } | null;
}

const personName = (person: OrderRelations["assignee"]): string =>
  person ? [person.name, person.paternal_lastname].filter(Boolean).join(" ") : "";

/**
 * Órdenes de compra en Excel (pedido del usuario, 21-nov): una fila por
 * producto de cada orden, con lo comprado hasta ahora (compras vigentes),
 * con los mismos filtros de la pantalla.
 */
export async function exportPurchaseOrdersService(
  filters: Omit<PurchaseOrderListFilter, "page" | "limit" | "orderBy" | "orderDir">
): Promise<ExcelSheet> {
  const result = await getPurchaseOrdersList({ ...filters, page: 1, limit: EXPORT_MAX_ROWS, orderBy: "created_at", orderDir: "desc" });
  assertExportSize(result.meta.total);

  const orders = result.data as (PurchaseOrderWithItems & OrderRelations)[];
  const rows = orders.flatMap((order) => {
    const [date, time] = excelDateTimeParts(order.created_at as Date);
    return order.items.map((item) => {
      const quotationItem = item.quotationItem as { product_code?: string | null; color?: string | null; product?: { name: string } | null } | null;
      const livePurchases = item.purchases.filter((purchase) => !purchase.is_deleted);
      const boughtQuantity = livePurchases.reduce((sum, purchase) => sum + Number(purchase.quantity), 0);
      const boughtAmount = livePurchases.reduce((sum, purchase) => sum + Number(purchase.amount), 0);
      return [
        `OC-${String(order.id).padStart(4, "0")}`,
        date,
        time,
        quotationCodeOf(order.quotation_id),
        order.quotation?.client?.name ?? "",
        personName(order.assignee),
        ORDER_STATUS_LABEL[order.status] ?? order.status,
        quotationItem?.product?.name ?? "",
        quotationItem?.product_code ?? "",
        quotationItem?.color ?? "",
        Number(item.quantity),
        ITEM_STATUS_LABEL[item.status] ?? item.status,
        boughtQuantity,
        excelMoney(boughtAmount),
      ];
    });
  });

  return {
    name: "Órdenes de compra",
    columns: [
      { header: "Orden", width: 10 },
      { header: "Fecha", width: 12 },
      { header: "Hora", width: 8 },
      { header: "Cotización", width: 12 },
      { header: "Cliente", width: 28 },
      { header: "Encargado", width: 22 },
      { header: "Estado orden", width: 13 },
      { header: "Producto", width: 32 },
      { header: "Código", width: 14 },
      { header: "Color", width: 14 },
      { header: "Cantidad", type: "number" },
      { header: "Estado producto", width: 15 },
      { header: "Comprado (cant.)", type: "number", width: 15 },
      { header: "Monto comprado", type: "money", width: 15 },
    ],
    rows,
  };
}

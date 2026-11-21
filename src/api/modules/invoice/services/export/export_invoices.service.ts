import { assertExportSize, EXPORT_MAX_ROWS } from "../../../../../core/excel/excel_export";
import { ExcelSheet } from "../../../../../core/excel/excel_export.types";
import { excelDate, excelMoney } from "../../../../../core/excel/excel_format";
import { InvoiceListFilter } from "../../types/invoice.types";
import { listInvoicesService } from "../list.service";

/**
 * Facturas en Excel (pedido del usuario, 21-nov): emitidas y de compra con
 * los mismos filtros de la pantalla. En las de compra, lo que se pagó en las
 * compras que cubre y sus productos.
 */
export async function exportInvoicesService(filters: Omit<InvoiceListFilter, "page" | "limit">): Promise<ExcelSheet> {
  const result = await listInvoicesService({ ...filters, page: 1, limit: EXPORT_MAX_ROWS });
  assertExportSize(result.meta.total);

  const rows = result.data.map((invoice) => [
    invoice.type === "issued" ? "Emitida" : "De compra",
    excelDate(invoice.created_at.date),
    invoice.created_at.time,
    invoice.series_number ?? "",
    excelDate(invoice.issue_date),
    invoice.supplier_name ?? "",
    invoice.quotation_codes.join(", "),
    invoice.description,
    invoice.purchases.map((line) => `${line.product_name} × ${line.quantity}`).join("; "),
    invoice.type === "purchase" ? excelMoney(invoice.purchases_total) : null,
    invoice.currency ?? "",
    excelMoney(invoice.total),
    invoice.has_file ? "Sí" : "Falta subir",
    invoice.created_by_name ?? "",
  ]);

  return {
    name: "Facturas",
    columns: [
      { header: "Tipo", width: 10 },
      { header: "Registrada", width: 12 },
      { header: "Hora", width: 8 },
      { header: "Serie-número", width: 16 },
      { header: "Emisión", width: 12 },
      { header: "Proveedor", width: 28 },
      { header: "Cotizaciones", width: 18 },
      { header: "Descripción", width: 30 },
      { header: "Productos comprados", width: 40 },
      { header: "Pagado en compras", type: "money", width: 16 },
      { header: "Moneda", width: 8 },
      { header: "Total declarado", type: "money", width: 15 },
      { header: "Archivo", width: 11 },
      { header: "Registró", width: 22 },
    ],
    rows,
  };
}

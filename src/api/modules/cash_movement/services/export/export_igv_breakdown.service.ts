import { ExcelSheet } from "../../../../../core/excel/excel_export.types";
import { excelDate, quotationCodeOf } from "../../../../../core/excel/excel_format";
import { StatisticsScope } from "../../../statistics/types/statistics.types";
import { getIgvBreakdownService } from "../find/igv_breakdown.service";

/**
 * Detalle del IGV del mes en Excel (pedido del usuario, 21-nov): hoja
 * "Cálculo" con la cuenta final, hoja "Ventas" (cobros con su IGV) y hoja
 * "Compras" (facturas de compra con su IGV) — los mismos números del diálogo.
 */
export async function exportIgvBreakdownService(
  scope: StatisticsScope,
  period?: string
): Promise<{ period: string; sheets: ExcelSheet[] }> {
  const breakdown = await getIgvBreakdownService(scope, period);
  const { sales, purchases } = breakdown;
  return {
    period: breakdown.period,
    sheets: [
      {
        name: "Cálculo",
        columns: [{ header: "Concepto", width: 46 }, { header: "Monto", type: "money" }],
        rows: [
          ["IGV de las ventas (cobros del mes)", sales.total_igv],
          ["IGV de las compras con factura (crédito fiscal)", purchases.total_igv],
          [breakdown.igv_balance < 0 ? "Saldo a favor" : "IGV a pagar (estimado)", Math.abs(breakdown.igv_balance)],
        ],
      },
      {
        name: "Ventas",
        columns: [
          { header: "Fecha", width: 12 },
          { header: "Cotización", width: 12 },
          { header: "Cliente", width: 32 },
          { header: "Cobrado", type: "money" },
          { header: "Base", type: "money" },
          { header: "IGV", type: "money" },
          { header: "Factura", width: 14 },
        ],
        rows: sales.lines.map((line) => [
          excelDate(line.paid_at),
          quotationCodeOf(line.quotation_id),
          line.client_name,
          line.amount,
          line.base,
          line.igv,
          line.invoice_issued ? "Emitida" : "No registrada",
        ]),
        footer: [["Total", "", "", sales.total_amount, null, sales.total_igv, ""]],
      },
      {
        name: "Compras",
        columns: [
          { header: "Factura", width: 16 },
          { header: "Emisión", width: 12 },
          { header: "Proveedor", width: 28 },
          { header: "Productos", width: 40 },
          { header: "Cotizaciones", width: 18 },
          { header: "Pagado", type: "money" },
          { header: "Base", type: "money" },
          { header: "IGV", type: "money" },
        ],
        rows: purchases.lines.map((line) => [
          line.series_number ?? `Sin número (#${line.invoice_id})`,
          excelDate(line.issue_date ?? line.first_spent_at),
          line.supplier_name ?? "",
          line.products.join(", "),
          line.quotation_ids.map(quotationCodeOf).join(", "),
          line.amount,
          line.base,
          line.igv,
        ]),
        footer: [["Total", "", "", "", "", purchases.total_amount, null, purchases.total_igv]],
      },
    ],
  };
}

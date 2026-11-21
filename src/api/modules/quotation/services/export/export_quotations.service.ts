import { assertExportSize, EXPORT_MAX_ROWS } from "../../../../../core/excel/excel_export";
import { ExcelSheet } from "../../../../../core/excel/excel_export.types";
import { excelDate, excelDateTimeParts, excelMoney, quotationCodeOf } from "../../../../../core/excel/excel_format";
import { QUOTATION_STATUS_LABEL, QuotationAttributes } from "../../model/quotation.model";
import { getQuotationsList } from "../find/quotation.service";

type QuotationListFilters = Omit<Parameters<typeof getQuotationsList>[0], "page" | "limit" | "orderBy" | "orderDir">;

interface QuotationRow extends QuotationAttributes {
  client?: { name: string } | null;
}

// Reporte de cotizaciones en Excel (pedido del usuario, 21-nov): las mismas
// filas que el listado con sus filtros, sin paginar (hasta EXPORT_MAX_ROWS).
export async function exportQuotationsService(filters: QuotationListFilters): Promise<ExcelSheet> {
  const result = await getQuotationsList({ ...filters, page: 1, limit: EXPORT_MAX_ROWS, orderBy: "created_at", orderDir: "desc" });
  assertExportSize(result.meta.total);

  const rows = (result.data as QuotationRow[]).map((quotation) => {
    const [date, time] = excelDateTimeParts(quotation.created_at);
    const total = excelMoney(quotation.total) ?? 0;
    const subtotal = excelMoney(quotation.subtotal) ?? 0;
    const paid = excelMoney(quotation.total_paid) ?? 0;
    return [
      quotationCodeOf(quotation.id),
      date,
      time,
      QUOTATION_STATUS_LABEL[quotation.status],
      quotation.client?.name ?? "",
      quotation.billing_name ?? "",
      quotation.includes_igv ? "Sí" : "No",
      subtotal,
      excelMoney(total - subtotal),
      total,
      paid,
      excelMoney(total - paid),
      excelDate(quotation.valid_until),
    ];
  });

  return {
    name: "Cotizaciones",
    columns: [
      { header: "Cotización", width: 12 },
      { header: "Fecha", width: 12 },
      { header: "Hora", width: 8 },
      { header: "Estado", width: 20 },
      { header: "Cliente", width: 32 },
      { header: "Facturar a", width: 28 },
      { header: "Con IGV", width: 9 },
      { header: "Subtotal", type: "money" },
      { header: "IGV", type: "money" },
      { header: "Total", type: "money" },
      { header: "Pagado", type: "money" },
      { header: "Saldo", type: "money" },
      { header: "Válida hasta", width: 12 },
    ],
    rows,
  };
}

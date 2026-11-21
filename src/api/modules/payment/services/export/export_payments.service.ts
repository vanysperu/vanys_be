import { assertExportSize, EXPORT_MAX_ROWS } from "../../../../../core/excel/excel_export";
import { ExcelSheet } from "../../../../../core/excel/excel_export.types";
import { excelDate, excelMoney, quotationCodeOf } from "../../../../../core/excel/excel_format";
import { loadGeneralVariableNames } from "../../../../../core/excel/excel_labels";
import { getPaymentsList, PaymentListFilter } from "../find/payment.service";

/**
 * Pagos en Excel (pedido del usuario, 21-nov): las mismas filas y filtros que
 * la pantalla de Pagos, con el total al final (solo de los vigentes: un pago
 * anulado se lista para que se vea, pero no suma).
 */
export async function exportPaymentsService(filters: Omit<PaymentListFilter, "page" | "limit">): Promise<ExcelSheet> {
  const result = await getPaymentsList({ ...filters, page: 1, limit: EXPORT_MAX_ROWS });
  assertExportSize(result.meta.total);
  const methods = await loadGeneralVariableNames("payment_method", filters.companyId);

  const rows = result.data.map((payment) => [
    excelDate(payment.paid_at),
    quotationCodeOf(payment.quotation_id),
    payment.client_name,
    payment.method ? (methods.get(payment.method) ?? payment.method) : "",
    payment.payment_account_name ?? "Efectivo",
    payment.operation_number ?? "",
    excelMoney(payment.amount),
    payment.is_deleted ? "Anulado" : "Vigente",
    payment.notes ?? "",
  ]);
  const activeTotal = result.data.filter((payment) => !payment.is_deleted).reduce((sum, payment) => sum + Number(payment.amount), 0);

  return {
    name: "Pagos",
    columns: [
      { header: "Fecha", width: 12 },
      { header: "Cotización", width: 12 },
      { header: "Cliente", width: 32 },
      { header: "Método", width: 16 },
      { header: "Cuenta", width: 20 },
      { header: "N° operación", width: 14 },
      { header: "Monto", type: "money" },
      { header: "Estado", width: 10 },
      { header: "Notas", width: 36 },
    ],
    rows,
    footer: [["Total vigente", "", "", "", "", "", excelMoney(activeTotal), "", ""]],
  };
}

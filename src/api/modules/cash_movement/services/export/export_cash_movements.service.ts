import { assertExportSize, EXPORT_MAX_ROWS } from "../../../../../core/excel/excel_export";
import { ExcelSheet } from "../../../../../core/excel/excel_export.types";
import { excelDate, excelMoney, quotationCodeOf } from "../../../../../core/excel/excel_format";
import { loadGeneralVariableNames } from "../../../../../core/excel/excel_labels";
import { CashFlowSource, CashMovementListFilter, getCashMovementsList } from "../find/cash_movement.service";

// De dónde sale cada fila de Caja, en palabras (mismo criterio que la pantalla).
const SOURCE_LABEL: Record<CashFlowSource, string> = {
  manual: "Movimiento manual",
  quotation_payment: "Cobro de cotización",
  quotation_expense: "Gasto o compra de cotización",
  employee_debt: "Deuda con personal",
  employee_debt_payment: "Reposición a personal",
  transfer: "Transferencia entre cuentas",
};

/**
 * Caja en Excel (pedido del usuario, 21-nov): hoja "Movimientos" con las
 * mismas filas y filtros de la pantalla, y hoja "Resumen" con los totales y el
 * saldo por cuenta (los mismos del recuadro de Caja).
 */
export async function exportCashMovementsService(filters: Omit<CashMovementListFilter, "page" | "limit">): Promise<ExcelSheet[]> {
  const result = await getCashMovementsList({ ...filters, page: 1, limit: EXPORT_MAX_ROWS });
  assertExportSize(result.meta.total);
  const categories = await loadGeneralVariableNames("cash_movement_type", filters.companyId);

  const rows = result.data.map((row) => {
    const amount = excelMoney(row.amount) ?? 0;
    const isIncome = row.direction === "income";
    return [
      excelDate(row.occurred_at),
      isIncome ? "Entrada" : "Salida",
      SOURCE_LABEL[row.source] ?? row.source,
      row.category ? (categories.get(row.category) ?? row.category) : "",
      row.description ?? "",
      row.payment_account_id === null ? (row.moves_cash ? "Efectivo" : "") : (row.payment_account_name ?? ""),
      row.operation_number ?? "",
      row.quotation_id ? quotationCodeOf(row.quotation_id) : "",
      isIncome ? amount : null,
      isIncome ? null : amount,
      row.moves_cash ? "Sí" : "No (lo pagó un trabajador)",
      row.paid_by_employee_name ?? "",
    ];
  });

  const { summary } = result;
  return [
    {
      name: "Movimientos",
      columns: [
        { header: "Fecha", width: 12 },
        { header: "Tipo", width: 9 },
        { header: "Origen", width: 26 },
        { header: "Categoría", width: 22 },
        { header: "Descripción", width: 40 },
        { header: "Cuenta", width: 20 },
        { header: "N° operación", width: 14 },
        { header: "Cotización", width: 12 },
        { header: "Entrada", type: "money" },
        { header: "Salida", type: "money" },
        { header: "Mueve caja", width: 14 },
        { header: "Pagado por", width: 22 },
      ],
      rows,
    },
    {
      name: "Resumen",
      columns: [
        { header: "Cuenta", width: 24 },
        { header: "Entradas", type: "money" },
        { header: "Salidas", type: "money" },
        { header: "Transferencias", type: "money", width: 15 },
        { header: "Ajustes", type: "money" },
        { header: "Neto", type: "money" },
      ],
      rows: summary.by_account.map((account) => [
        account.payment_account_name,
        account.income,
        account.expense,
        account.transfers,
        account.adjustments,
        account.net,
      ]),
      footer: [["Total", summary.income, summary.expense, summary.transfers, summary.adjustments, summary.net]],
    },
  ];
}

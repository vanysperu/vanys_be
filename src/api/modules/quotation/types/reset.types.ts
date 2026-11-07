// Resetear una cotización (solo Super Administrador): vuelve a Pendiente y se
// borra físicamente todo lo que generó. GET /quotation/:id/reset-preview dice
// qué se va a borrar; PUT /quotation/:id/reset lo hace.
export interface ResetMoneyLine {
  count: number;
  total: number;
}

export interface QuotationResetSummary {
  payments: ResetMoneyLine;
  // Gastos que no son compras.
  expenses: ResetMoneyLine;
  purchases: ResetMoneyLine;
  purchase_orders: number;
  // Deudas con trabajadores nacidas de esas compras.
  debts: ResetMoneyLine;
  // Lo repuesto a trabajadores por esas deudas (una reposición que cubría otras
  // deudas se conserva, solo sin esta parte).
  reimbursements: ResetMoneyLine;
  // Movimientos manuales de Caja vinculados a la cotización o a sus órdenes.
  cash_movements: ResetMoneyLine;
  invoices_deleted: number;
  // Facturas que cubren además compras de otra cotización: se conservan.
  invoices_kept: number;
}

export interface QuotationResetPreview {
  quotation_id: number;
  quotation_code: string;
  status: string;
  summary: QuotationResetSummary;
  can_reset: boolean;
  blocked_reason: string | null;
  // Meses cerrados (YYYY-MM) que impiden resetear.
  blocked_periods: string[];
}

export interface QuotationResetResult {
  id: number;
  status: "pending";
  valid_until: string;
  summary: QuotationResetSummary;
}

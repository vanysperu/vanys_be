// GET /quotation/:id/profit — ganancia de una cotización (pedido explícito del
// usuario: "cuánto se le sacó de ganancia: pagos recibidos, IGV, gastos,
// compras, y así vemos neto cuánto quedó"). Solo en el sistema, nunca en el PDF.
export interface QuotationProfit {
  quotation_id: number;
  total: number; // lo que paga el cliente (con IGV si lo incluye)
  subtotal: number; // sin IGV
  igv_total: number; // total − subtotal
  igv_rate: number | null; // fracción de IGV de la empresa (0.18), null si la cotización no lleva IGV
  // Lo cobrado hasta hoy y la parte de eso que es IGV (para SUNAT).
  payments_received: number;
  igv_in_payments: number;
  pending: number; // total − pagos recibidos (nunca negativo)
  // Costos cargados en la cotización (vigentes, no anulados).
  expenses: number; // gastos que no son compras de una orden de compra
  purchases: number; // compras de órdenes de compra (las pague la empresa o un trabajador)
  purchases_with_invoice: number; // de esas, las que tienen factura
  igv_credit: number; // IGV recuperable de las compras con factura
  // Hoy: cobrado − IGV del cobro − gastos − compras + IGV recuperable.
  net_profit: number;
  net_margin_rate: number | null; // net_profit / (cobrado − IGV del cobro)
  // Cuando se cobre todo: subtotal − gastos − compras + IGV recuperable.
  projected_profit: number;
  projected_margin_rate: number | null;
}

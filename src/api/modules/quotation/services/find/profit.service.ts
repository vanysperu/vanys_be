import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { roundMoney } from "../../../../../utils/numbers";
import { getIgvRate } from "../shared/tax_config";
import { QuotationProfit } from "../../types/profit.types";

interface ProfitRow {
  company_id: number;
  total: unknown;
  subtotal: unknown;
  includes_igv: number | boolean;
  payments: unknown;
  expenses: unknown;
  purchases: unknown;
  purchases_with_invoice: unknown;
}

const ratioOf = (numerator: number, denominator: number): number | null =>
  denominator > 0 ? Math.round((numerator / denominator) * 10000) / 10000 : null;

/**
 * Ganancia de una cotización con lo registrado hasta hoy. Pagos y gastos
 * anulados no cuentan (mismo criterio que Caja). Una compra cuenta como costo
 * aunque la haya pagado un trabajador y todavía no se le haya repuesto: el
 * costo existe igual. El IGV de los cobros sale con la misma proporción de la
 * cotización (total − subtotal) / total.
 */
export async function getQuotationProfitService(quotationId: number): Promise<QuotationProfit> {
  const [row] = (await DataBase.instance.sequelize.query(
    `SELECT q.company_id, q.total, q.subtotal, q.includes_igv,
            (SELECT COALESCE(SUM(qp.amount), 0) FROM quotation_payment qp
              WHERE qp.quotation_id = q.id AND qp.is_deleted = false) AS payments,
            (SELECT COALESCE(SUM(qe.amount), 0) FROM quotation_expense qe
              LEFT JOIN purchase_order_item_purchase pop ON pop.quotation_expense_id = qe.id
              WHERE qe.quotation_id = q.id AND qe.is_deleted = false AND pop.id IS NULL) AS expenses,
            (SELECT COALESCE(SUM(qe.amount), 0) FROM quotation_expense qe
              INNER JOIN purchase_order_item_purchase pop ON pop.quotation_expense_id = qe.id
              WHERE qe.quotation_id = q.id AND qe.is_deleted = false) AS purchases,
            (SELECT COALESCE(SUM(qe.amount), 0) FROM quotation_expense qe
              INNER JOIN purchase_order_item_purchase pop ON pop.quotation_expense_id = qe.id
              INNER JOIN invoice_purchase ip ON ip.purchase_id = pop.id
              WHERE qe.quotation_id = q.id AND qe.is_deleted = false) AS purchases_with_invoice
     FROM quotation q
     WHERE q.id = :quotationId`,
    { type: QueryTypes.SELECT, replacements: { quotationId } }
  )) as ProfitRow[];
  if (!row) throw new AppError(404, "La cotización no existe");

  const total = Number(row.total);
  const subtotal = Number(row.subtotal);
  const includesIgv = Boolean(row.includes_igv);
  const igvTotal = roundMoney(total - subtotal);
  const payments = roundMoney(Number(row.payments));
  const igvInPayments = total > 0 ? roundMoney((payments * igvTotal) / total) : 0;
  const expenses = roundMoney(Number(row.expenses));
  const purchases = roundMoney(Number(row.purchases));
  const purchasesWithInvoice = roundMoney(Number(row.purchases_with_invoice));
  // El IGV de una compra con factura se recupera (crédito fiscal) aunque la
  // cotización no lleve IGV: la tasa es la vigente de la empresa.
  const companyRate = await getIgvRate(Number(row.company_id));
  const igvCredit = roundMoney(companyRate > 0 ? (purchasesWithInvoice * companyRate) / (1 + companyRate) : 0);
  const costs = expenses + purchases - igvCredit;
  const netBase = roundMoney(payments - igvInPayments);
  const netProfit = roundMoney(netBase - costs);
  const projectedProfit = roundMoney(subtotal - costs);

  return {
    quotation_id: quotationId,
    total,
    subtotal,
    igv_total: igvTotal,
    igv_rate: includesIgv ? companyRate : null,
    payments_received: payments,
    igv_in_payments: igvInPayments,
    pending: roundMoney(Math.max(total - payments, 0)),
    expenses,
    purchases,
    purchases_with_invoice: purchasesWithInvoice,
    igv_credit: igvCredit,
    net_profit: netProfit,
    net_margin_rate: ratioOf(netProfit, netBase),
    projected_profit: projectedProfit,
    projected_margin_rate: ratioOf(projectedProfit, subtotal),
  };
}

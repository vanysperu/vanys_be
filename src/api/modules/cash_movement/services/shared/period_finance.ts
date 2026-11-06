import { getTrendService } from "../../../statistics/services/find/trend.service";
import { MONEY_SCOPE_SQL, selectRows, toMoney } from "../../../statistics/services/shared/scope";
import { StatisticsScope } from "../../../statistics/types/statistics.types";
import { getIgvRate } from "../../../quotation/services/shared/tax_config";
import { periodBounds } from "../../../../../utils/dateUtils";
import { EXPENSE_ACTIVE_SQL } from "./cash_flow.sql";

// Resultado de un mes de Caja y el IGV que corresponde pagarle a SUNAT
// (pedido explícito del usuario: "ver la ganancia que va del mes, lo que quedó
// neto en cada cierre y cuánto IGV hay que pagar, así saber cuánto nos queda").
export interface PeriodFinance {
  period: string; // YYYY-MM
  // Mismos números que Caja y Estadísticas (getTrendService): cobros + otros
  // ingresos, egresos y ajustes de meses cerrados, por fecha del movimiento.
  income: number;
  expenses: number;
  adjustments: number;
  // income − expenses + adjustments = lo que cambió la caja en el mes.
  result: number;
  // IGV contenido en los cobros del mes de cotizaciones con IGV (débito).
  igv_sales: number;
  // IGV de las compras con factura del mes (crédito fiscal).
  igv_purchases: number;
  // igv_sales − igv_purchases: positivo = a pagar; negativo = saldo a favor.
  igv_balance: number;
  igv_payable: number; // max(igv_balance, 0)
  // Lo que queda después de pagar el IGV: result − igv_payable.
  net_after_igv: number;
}

interface BucketRow {
  bucket: string;
  amount: unknown;
}

interface PurchaseBucketRow extends BucketRow {
  company_id: number;
}

const MONTH_FORMAT = "%Y-%m";

// IGV contenido en un monto que ya lo incluye: 118 con 18% -> 18.
const igvInsideAmount = (amount: number, rate: number): number => (rate > 0 ? (amount * rate) / (1 + rate) : 0);

/**
 * Resultado e IGV de varios meses de una vez (Caja pide uno; Cierres, una
 * página). Todo agrupado por mes en SQL: nunca una consulta por mes.
 *
 * IGV estimado con criterio de caja: el IGV de lo COBRADO en el mes (cada pago
 * lleva la misma proporción de IGV que su cotización) menos el IGV de las
 * compras registradas "con factura" en el mes (el monto pagado ya incluye el
 * IGV, con la tasa vigente de la empresa). El monto oficial lo determina el
 * contador con los comprobantes; esto es para saber cuánto apartar.
 */
export async function getPeriodFinances(scope: StatisticsScope, periods: string[]): Promise<Map<string, PeriodFinance>> {
  if (periods.length === 0) return new Map();
  const sorted = [...periods].sort();
  const from = periodBounds(sorted[0] as string).start;
  const to = periodBounds(sorted[sorted.length - 1] as string).end;
  const replacements = { companyId: scope.companyId, businessUnitId: scope.businessUnitId, from, to, fmt: MONTH_FORMAT };

  const [trend, igvSalesRows, purchaseRows] = await Promise.all([
    getTrendService(scope, { date_from: from, date_to: to, previous_from: from, previous_to: to, granularity: "month" }),
    selectRows<BucketRow>(
      `SELECT DATE_FORMAT(qp.paid_at, :fmt) AS bucket,
              COALESCE(SUM(qp.amount * (q.total - q.subtotal) / q.total), 0) AS amount
       FROM quotation_payment qp
       INNER JOIN quotation q ON q.id = qp.quotation_id
       WHERE qp.is_deleted = false AND q.includes_igv = true AND q.total > 0
         AND ${MONEY_SCOPE_SQL} AND qp.paid_at BETWEEN :from AND :to
       GROUP BY bucket`,
      replacements
    ),
    // Compras con factura (módulo invoice; una factura puede cubrir varias):
    // su gasto vivo, por fecha de compra.
    selectRows<PurchaseBucketRow>(
      `SELECT DATE_FORMAT(qe.spent_at, :fmt) AS bucket, q.company_id, COALESCE(SUM(qe.amount), 0) AS amount
       FROM invoice_purchase ip
       INNER JOIN purchase_order_item_purchase pop ON pop.id = ip.purchase_id
       INNER JOIN quotation_expense qe ON qe.id = pop.quotation_expense_id
       INNER JOIN quotation q ON q.id = qe.quotation_id
       WHERE ${EXPENSE_ACTIVE_SQL} AND ${MONEY_SCOPE_SQL} AND qe.spent_at BETWEEN :from AND :to
       GROUP BY bucket, q.company_id`,
      replacements
    ),
  ]);

  // Tasa de IGV de cada empresa involucrada (una sola salvo el Super
  // Administrador mirando todas).
  const companyIds = [...new Set(purchaseRows.map((row) => Number(row.company_id)))];
  const rates = new Map(await Promise.all(companyIds.map(async (id) => [id, await getIgvRate(id)] as const)));

  const igvSales = new Map(igvSalesRows.map((row) => [row.bucket, toMoney(row.amount)]));
  const igvPurchases = new Map<string, number>();
  for (const row of purchaseRows) {
    const igv = igvInsideAmount(toMoney(row.amount), rates.get(Number(row.company_id)) ?? 0);
    igvPurchases.set(row.bucket, (igvPurchases.get(row.bucket) ?? 0) + igv);
  }
  const trendByMonth = new Map(trend.map((point) => [point.bucket, point]));

  return new Map(
    periods.map((period) => {
      const point = trendByMonth.get(period);
      const income = point?.income ?? 0;
      const expenses = point?.expenses ?? 0;
      const adjustments = point?.adjustments ?? 0;
      const result = toMoney(income - expenses + adjustments);
      const sales = toMoney(igvSales.get(period));
      const purchases = toMoney(igvPurchases.get(period));
      const balance = toMoney(sales - purchases);
      const payable = Math.max(balance, 0);
      return [
        period,
        {
          period,
          income,
          expenses,
          adjustments,
          result,
          igv_sales: sales,
          igv_purchases: purchases,
          igv_balance: balance,
          igv_payable: payable,
          net_after_igv: toMoney(result - payable),
        },
      ];
    })
  );
}

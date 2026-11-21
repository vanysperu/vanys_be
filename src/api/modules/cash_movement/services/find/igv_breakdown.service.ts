import { getIgvRate } from "../../../quotation/services/shared/tax_config";
import { selectRows, toMoney } from "../../../statistics/services/shared/scope";
import { StatisticsScope } from "../../../statistics/types/statistics.types";
import { periodBounds, periodOf, todayInBusinessTz } from "../../../../../utils/dateUtils";
import {
  getPeriodFinances,
  igvInsideAmount,
  IGV_PURCHASES_FROM_SQL,
  IGV_PURCHASES_WHERE_SQL,
  IGV_SALES_AMOUNT_SQL,
  IGV_SALES_FROM_SQL,
  IGV_SALES_WHERE_SQL,
} from "../shared/period_finance";

// "¿Cómo se llegó al IGV a pagar?" (pedido del usuario, 21-nov): el detalle,
// línea por línea, de lo que suma el IGV de un mes en Caja — los cobros con su
// IGV (débito) y las compras con factura con su IGV (crédito fiscal) — y la
// cuenta final. Los TOTALES salen de getPeriodFinances (el mismo cálculo del
// recuadro de Caja), así el detalle nunca dice otro número.

// Tope de líneas por lado: un mes normal tiene decenas; el tope solo evita
// respuestas enormes. Los totales siempre son del mes completo.
export const IGV_BREAKDOWN_MAX_LINES = 1000;

export interface IgvSaleLine {
  payment_id: number;
  paid_at: string; // YYYY-MM-DD
  quotation_id: number;
  client_name: string;
  amount: number; // lo cobrado (con IGV)
  base: number;
  igv: number;
  // ¿Se registró factura emitida para la cotización? (sin número: el sistema
  // no emite comprobantes todavía).
  invoice_issued: boolean;
}

export interface IgvPurchaseLine {
  invoice_id: number;
  series_number: string | null;
  issue_date: string | null; // YYYY-MM-DD
  supplier_name: string | null;
  first_spent_at: string; // YYYY-MM-DD: primera compra del mes con esa factura
  products: string[];
  quotation_ids: number[];
  amount: number; // lo pagado en las compras (con IGV)
  base: number;
  igv: number;
}

export interface IgvBreakdown {
  period: string;
  // Tasa vigente de la empresa (null si se miran varias empresas a la vez).
  igv_rate: number | null;
  sales: { lines: IgvSaleLine[]; total_amount: number; total_igv: number; truncated: boolean };
  purchases: { lines: IgvPurchaseLine[]; total_amount: number; total_igv: number; truncated: boolean };
  igv_balance: number; // ventas − compras: positivo = a pagar, negativo = saldo a favor
  igv_payable: number;
}

interface SaleRow {
  payment_id: number;
  paid_at: string;
  quotation_id: number;
  client_name: string | null;
  amount: unknown;
  igv: unknown;
  invoice_issued: unknown;
}

interface PurchaseRow {
  invoice_id: number;
  series_number: string | null;
  issue_date: string | null;
  supplier_name: string | null;
  spent_at: string;
  company_id: number;
  quotation_id: number;
  product_name: string | null;
  amount: unknown;
}

const toLine = (amount: number, igv: number) => ({ amount: toMoney(amount), igv: toMoney(igv), base: toMoney(amount - igv) });

// Una fila por factura: sus compras del mes (pueden ser de varias cotizaciones).
function groupPurchasesByInvoice(rows: PurchaseRow[], rates: Map<number, number>): IgvPurchaseLine[] {
  const byInvoice = new Map<number, { row: PurchaseRow; amount: number; igv: number; products: Set<string>; quotations: Set<number> }>();
  for (const row of rows) {
    const amount = Number(row.amount ?? 0);
    const igv = igvInsideAmount(amount, rates.get(Number(row.company_id)) ?? 0);
    const current = byInvoice.get(Number(row.invoice_id)) ?? { row, amount: 0, igv: 0, products: new Set<string>(), quotations: new Set<number>() };
    current.amount += amount;
    current.igv += igv;
    if (row.product_name) current.products.add(row.product_name);
    current.quotations.add(Number(row.quotation_id));
    byInvoice.set(Number(row.invoice_id), current);
  }
  return [...byInvoice.values()].map(({ row, amount, igv, products, quotations }) => ({
    invoice_id: Number(row.invoice_id),
    series_number: row.series_number,
    issue_date: row.issue_date,
    supplier_name: row.supplier_name,
    first_spent_at: row.spent_at,
    products: [...products],
    quotation_ids: [...quotations],
    ...toLine(amount, igv),
  }));
}

export async function getIgvBreakdownService(scope: StatisticsScope, period?: string): Promise<IgvBreakdown> {
  const target = period ?? periodOf(todayInBusinessTz());
  const { start: from, end: to } = periodBounds(target);
  const replacements = { companyId: scope.companyId, businessUnitId: scope.businessUnitId, from, to, limit: IGV_BREAKDOWN_MAX_LINES + 1 };

  const [finances, saleRows, purchaseRows] = await Promise.all([
    getPeriodFinances(scope, [target]),
    selectRows<SaleRow>(
      `SELECT qp.id AS payment_id, DATE_FORMAT(qp.paid_at, '%Y-%m-%d') AS paid_at, q.id AS quotation_id,
              COALESCE(NULLIF(q.billing_name, ''), c.name) AS client_name,
              qp.amount AS amount, ${IGV_SALES_AMOUNT_SQL} AS igv,
              EXISTS (SELECT 1 FROM invoice i WHERE i.quotation_id = q.id AND i.type = 'issued') AS invoice_issued
       FROM ${IGV_SALES_FROM_SQL}
       LEFT JOIN client c ON c.id = q.client_id
       WHERE ${IGV_SALES_WHERE_SQL}
       ORDER BY qp.paid_at ASC, qp.id ASC
       LIMIT :limit`,
      replacements
    ),
    // Una fila por compra con factura; se agrupan por factura abajo. Se
    // acota por compras (no por facturas): alcanza para avisar si se cortó.
    selectRows<PurchaseRow>(
      `SELECT i.id AS invoice_id, i.series_number, DATE_FORMAT(i.issue_date, '%Y-%m-%d') AS issue_date,
              s.name AS supplier_name, DATE_FORMAT(qe.spent_at, '%Y-%m-%d') AS spent_at,
              q.company_id, q.id AS quotation_id, p.name AS product_name, qe.amount AS amount
       FROM ${IGV_PURCHASES_FROM_SQL}
       INNER JOIN invoice i ON i.id = ip.invoice_id
       LEFT JOIN supplier s ON s.id = i.supplier_id
       LEFT JOIN purchase_order_item poi ON poi.id = pop.purchase_order_item_id
       LEFT JOIN quotation_item qi ON qi.id = poi.quotation_item_id
       LEFT JOIN product p ON p.id = qi.product_id
       WHERE ${IGV_PURCHASES_WHERE_SQL}
       ORDER BY qe.spent_at ASC, pop.id ASC
       LIMIT :limit`,
      replacements
    ),
  ]);

  const finance = finances.get(target);
  const salesTruncated = saleRows.length > IGV_BREAKDOWN_MAX_LINES;
  const purchasesTruncated = purchaseRows.length > IGV_BREAKDOWN_MAX_LINES;
  const keptSales = saleRows.slice(0, IGV_BREAKDOWN_MAX_LINES);
  const keptPurchases = purchaseRows.slice(0, IGV_BREAKDOWN_MAX_LINES);

  const companyIds = [...new Set(keptPurchases.map((row) => Number(row.company_id)))];
  const rates = new Map(await Promise.all(companyIds.map(async (id) => [id, await getIgvRate(id)] as const)));
  const igvRate = scope.companyId ? await getIgvRate(scope.companyId) : null;

  const sales: IgvSaleLine[] = keptSales.map((row) => ({
    payment_id: Number(row.payment_id),
    paid_at: row.paid_at,
    quotation_id: Number(row.quotation_id),
    client_name: row.client_name ?? "—",
    invoice_issued: Number(row.invoice_issued) === 1,
    ...toLine(Number(row.amount ?? 0), Number(row.igv ?? 0)),
  }));

  return {
    period: target,
    igv_rate: igvRate,
    sales: {
      lines: sales,
      total_amount: toMoney(keptSales.reduce((sum, row) => sum + Number(row.amount ?? 0), 0)),
      total_igv: finance?.igv_sales ?? 0,
      truncated: salesTruncated,
    },
    purchases: {
      lines: groupPurchasesByInvoice(keptPurchases, rates),
      total_amount: toMoney(keptPurchases.reduce((sum, row) => sum + Number(row.amount ?? 0), 0)),
      total_igv: finance?.igv_purchases ?? 0,
      truncated: purchasesTruncated,
    },
    igv_balance: finance?.igv_balance ?? 0,
    igv_payable: finance?.igv_payable ?? 0,
  };
}

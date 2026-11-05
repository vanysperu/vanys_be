import { getPeriodFinances, PeriodFinance } from "../../../cash_movement/services/shared/period_finance";
import { CashPeriodTotals } from "../../types/cash_closing.types";

const toMoney = (value: number): number => Math.round(value * 100) / 100;

// Un mes cerrado manda con sus totales guardados (lo que se vio al cerrar);
// el IGV se recalcula igual, porque el cierre no lo guarda.
const withTotals = (finance: PeriodFinance, totals: CashPeriodTotals | null): PeriodFinance => {
  if (!totals) return finance;
  const result = toMoney(totals.income - totals.expense + totals.adjustments);
  return {
    ...finance,
    income: totals.income,
    expenses: totals.expense,
    adjustments: totals.adjustments,
    result,
    net_after_igv: toMoney(result - finance.igv_payable),
  };
};

/**
 * Resultado del mes, IGV estimado y neto después del IGV de cada mes de Cierres
 * (pedido explícito del usuario: "en cada cierre cuánto quedó neto"). Una sola
 * tanda de consultas agrupadas para toda la página. Cierres es de toda la
 * empresa: sin filtro de tienda.
 */
export async function financesForPeriods(
  companyId: number,
  items: { period: string; totals: CashPeriodTotals | null }[]
): Promise<Map<string, PeriodFinance>> {
  const finances = await getPeriodFinances({ companyId, businessUnitId: null }, items.map((item) => item.period));
  return new Map(
    items.flatMap((item) => {
      const finance = finances.get(item.period);
      return finance ? [[item.period, withTotals(finance, item.totals)] as const] : [];
    })
  );
}

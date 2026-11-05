import { StatisticsScope } from "../../../statistics/types/statistics.types";
import { periodOf, todayInBusinessTz } from "../../../../../utils/dateUtils";
import { getPeriodFinances, PeriodFinance } from "../shared/period_finance";

export interface MonthSummary extends PeriodFinance {
  // true = mes en curso: los números son "lo que va del mes".
  is_current: boolean;
}

// Resumen de un mes para Caja: resultado (ingresos − egresos), IGV estimado y
// lo que queda después del IGV. Por defecto, el mes en curso.
export async function getMonthSummaryService(scope: StatisticsScope, period?: string): Promise<MonthSummary> {
  const currentPeriod = periodOf(todayInBusinessTz());
  const target = period ?? currentPeriod;
  const finances = await getPeriodFinances(scope, [target]);
  const finance = finances.get(target) as PeriodFinance;
  return { ...finance, is_current: target === currentPeriod };
}

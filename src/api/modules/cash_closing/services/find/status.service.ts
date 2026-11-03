import { todayInBusinessTz } from "../../../../../utils/dateUtils";
import { CashPeriodStatus } from "../../types/cash_closing.types";
import { buildCashPeriodStatus, loadPeriodMap } from "../shared/period_state.service";

/**
 * Estado del cierre de una empresa (GET /cash-closing/status): mes de inicio,
 * meses cerrados y reabiertos. Lo usan TODOS los formularios de dinero (también
 * el gestor) para bloquear fechas de meses cerrados; solo UX: el backend
 * revalida en cada escritura (core/money/cashPeriod.ts).
 */
export async function getCashClosingStatus(companyId: number): Promise<CashPeriodStatus> {
  const map = await loadPeriodMap(companyId);
  return buildCashPeriodStatus(map, todayInBusinessTz());
}

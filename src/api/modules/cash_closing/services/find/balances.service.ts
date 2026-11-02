import { todayInBusinessTz } from "../../../../../utils/dateUtils";
import { CashBalancesResponse } from "../../types/cash_closing.types";
import { loadPeriodMap } from "../shared/period_state.service";
import { computeCurrentBalances } from "../shared/balances.service";

/** Saldos actuales por cuenta (GET /cash-closing/balances). Ver computeCurrentBalances. */
export async function getCashBalances(companyId: number): Promise<CashBalancesResponse> {
  const map = await loadPeriodMap(companyId);
  return computeCurrentBalances(companyId, map, todayInBusinessTz());
}

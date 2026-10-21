import { StatisticsOverview, StatisticsScope } from "../../types/statistics.types";
import { resolvePeriod } from "../shared/period";
import { getKpisService } from "./kpis.service";
import { getPaymentsByAccountService } from "./paymentsByAccount.service";
import { getReceivablesAgingService } from "./receivablesAging.service";
import { getSellersService } from "./sellers.service";
import { getStatusBreakdownService } from "./statusBreakdown.service";
import { getTopClientsService } from "./topClients.service";
import { getTopProductsService } from "./topProducts.service";
import { getTopTechniquesService } from "./topTechniques.service";
import { getTrendService } from "./trend.service";

// Todo el tablero en UNA sola respuesta (un viaje al servidor, que en
// Hostinger puede estar "dormido"): cada bloque es una consulta agregada en
// SQL y corren en paralelo. Ningún bloque trae filas sueltas a memoria.
export async function getStatisticsOverviewService(
  scope: StatisticsScope,
  dateFrom: string,
  dateTo: string
): Promise<StatisticsOverview> {
  const period = resolvePeriod(dateFrom, dateTo);

  const [current, previous, trend, statusBreakdown, topClients, topProducts, topTechniques, aging, accounts, sellers] =
    await Promise.all([
      getKpisService(scope, period.date_from, period.date_to),
      getKpisService(scope, period.previous_from, period.previous_to),
      getTrendService(scope, period),
      getStatusBreakdownService(scope, period),
      getTopClientsService(scope, period),
      getTopProductsService(scope, period),
      getTopTechniquesService(scope, period),
      getReceivablesAgingService(scope),
      getPaymentsByAccountService(scope, period),
      getSellersService(scope, period),
    ]);

  return {
    period,
    kpis: { current, previous },
    trend,
    status_breakdown: statusBreakdown,
    top_clients: topClients,
    top_products: topProducts,
    top_techniques: topTechniques,
    receivables_aging: aging,
    payments_by_account: accounts,
    sellers,
  };
}

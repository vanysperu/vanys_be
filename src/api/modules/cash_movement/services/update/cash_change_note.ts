import { CashChangeResult } from "../../../../../core/money/cashPeriod";
import { formatDateOnlyEsPe, formatPeriodEs } from "../../../../../utils/dateUtils";

// Texto que se agrega al log / evento de la cotización cuando una
// corrección, anulación o restauración tocó un mes CERRADO y se registró como
// ajuste (cierre de caja, fase 2). Vacío para una corrección normal: así los
// textos de la fase 1 no cambian.
export const cashChangeNote = (result: CashChangeResult): string => {
  if (result.kind !== "adjustment" || result.adjustedPeriod === null) return "";
  const posted = result.postedDate === null ? "" : `, registrado el ${formatDateOnlyEsPe(result.postedDate)}`;
  return ` (ajuste de ${formatPeriodEs(result.adjustedPeriod)}${posted})`;
};

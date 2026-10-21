import { addDaysToDateOnly } from "../../../../../utils/dateUtils";
import { StatisticsPeriod, TrendGranularity } from "../../types/statistics.types";

const DAY_MS = 24 * 60 * 60 * 1000;

// Hasta ~2 meses se agrupa por día (se ve el detalle); más allá, por mes (si
// no, un año serían 365 barras ilegibles).
const MAX_DAYS_FOR_DAILY_TREND = 62;

// Formato de DATE_FORMAT de MySQL por granularidad — constante de código,
// nunca un valor del usuario.
export const BUCKET_SQL_FORMAT: Record<TrendGranularity, string> = {
  day: "%Y-%m-%d",
  month: "%Y-%m",
};

const toEpochDay = (dateOnly: string): number => {
  const [year = 0, month = 1, day = 1] = dateOnly.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
};

// Días del rango contando ambos extremos (21/10 → 21/10 = 1 día).
export const daysInRange = (from: string, to: string): number => toEpochDay(to) - toEpochDay(from) + 1;

// Periodo pedido + el anterior de la MISMA duración, inmediatamente antes:
// así "últimos 30 días" se compara con los 30 días previos, y un mes a medias
// no se compara contra un mes completo.
export const resolvePeriod = (from: string, to: string): StatisticsPeriod => {
  const length = daysInRange(from, to);
  return {
    date_from: from,
    date_to: to,
    previous_from: addDaysToDateOnly(from, -length),
    previous_to: addDaysToDateOnly(from, -1),
    granularity: length <= MAX_DAYS_FOR_DAILY_TREND ? "day" : "month",
  };
};

// Todos los tramos del periodo (aunque no tengan movimiento), para que la
// gráfica no "salte" días o meses vacíos.
export const buildBuckets = (period: StatisticsPeriod): string[] => {
  if (period.granularity === "day") {
    const length = daysInRange(period.date_from, period.date_to);
    return Array.from({ length }, (_, index) => addDaysToDateOnly(period.date_from, index));
  }

  const buckets: string[] = [];
  const [fromYear = 0, fromMonth = 1] = period.date_from.split("-").map(Number);
  const [toYear = 0, toMonth = 1] = period.date_to.split("-").map(Number);
  // Recorrido acotado por el rango validado (máx. 3 años = 37 meses).
  for (let year = fromYear, month = fromMonth; year < toYear || (year === toYear && month <= toMonth); ) {
    buckets.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return buckets;
};

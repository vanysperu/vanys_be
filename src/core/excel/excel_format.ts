import { formatDateOnlyEsPe, utcToBusinessParts } from "../../utils/dateUtils";

// Formatos de celda de los reportes (21-nov). Fechas en texto "dd/mm/aaaa" y
// hora "HH:mm" de Lima en columnas separadas (regla de fechas del proyecto).

// DATEONLY ("2026-11-21") -> "21/11/2026"; vacío si no hay.
export const excelDate = (value: Date | string | null | undefined): string => (value ? formatDateOnlyEsPe(value) : "");

// Instante UTC (created_at) -> ["21/11/2026", "13:05"] en hora de Lima.
export const excelDateTimeParts = (instant: Date | string | null | undefined): [string, string] => {
  if (!instant) return ["", ""];
  const { date, time } = utcToBusinessParts(instant);
  return [formatDateOnlyEsPe(date), time];
};

// Montos: MySQL devuelve DECIMAL como texto; en Excel va como número.
export const excelMoney = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
};

export const quotationCodeOf = (id: number | string): string => `COT-${String(id).padStart(4, "0")}`;

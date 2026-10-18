// Offset fijo de Lima (sin horario de verano).
const BUSINESS_UTC_OFFSET = "-05:00";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

/**
 * Convierte el día de un filtro ("YYYY-MM-DD", día calendario de Lima) al
 * instante UTC donde empieza (o termina, con isEnd) ese día, en el formato
 * de MySQL "YYYY-MM-DD HH:mm:ss" — para comparar contra columnas DATETIME,
 * que se guardan en UTC.
 *
 * Antes hacía `new Date("2026-10-17").setHours(0)` en la hora del servidor:
 * ese string se lee como medianoche UTC, que en Lima es el día 16, así que
 * "desde el 17" filtraba desde el 16 (y el resultado cambiaba según la zona
 * horaria del servidor).
 */
export const formatDateForSQL = (value?: string, isEnd = false): string | null => {
  if (!value || !ISO_DATE.test(value)) return null;

  const day = value.slice(0, 10);
  const instant = new Date(`${day}T${isEnd ? "23:59:59.999" : "00:00:00.000"}${BUSINESS_UTC_OFFSET}`);
  if (Number.isNaN(instant.getTime())) return null;

  return instant.toISOString().slice(0, 19).replace("T", " ");
};

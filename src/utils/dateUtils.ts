import moment from "moment";

// Punto único para obtener "ahora" en UTC real al sellar campos de auditoría
// (created_at/updated_at). Antes convivían dos formas distintas de hacer lo
// mismo (`new Date()` a secas y `moment().utc().toDate()` inline) esparcidas
// por todos los services -- funcionalmente equivalentes (un Date de JS
// siempre almacena el instante en UTC), pero inconsistentes como estilo.
export const nowUtc = (): Date => moment().utc().toDate();

// Zona horaria del negocio (CLAUDE.md: UTC-5). Todo lo que se MUESTRA o se
// decide por "día calendario" (fecha de emisión, vencimiento) se resuelve
// acá, explícito, en vez de depender de la zona del servidor.
export const BUSINESS_TIME_ZONE = "America/Lima";

// "en-CA" formatea como YYYY-MM-DD, que es justo el formato DATEONLY.
const businessDateOnlyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const businessDateFormatter = new Intl.DateTimeFormat("es-PE", {
  timeZone: BUSINESS_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const businessDateTimeFormatter = new Intl.DateTimeFormat("es-PE", {
  timeZone: BUSINESS_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

// Día calendario (YYYY-MM-DD) de un instante, visto desde Lima.
export const toBusinessDateOnly = (instant: Date): string => businessDateOnlyFormatter.format(instant);

// "Hoy" en Lima como YYYY-MM-DD — para comparar contra columnas DATEONLY.
export const todayInBusinessTz = (): string => toBusinessDateOnly(new Date());

// Suma días a una fecha YYYY-MM-DD con aritmética en UTC pura: no hay hora
// de por medio, así que no hay forma de que un cambio de zona la corra.
export const addDaysToDateOnly = (dateOnly: string, days: number): string => {
  const [year = 0, month = 1, day = 1] = dateOnly.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

// Normaliza un valor DATEONLY a "YYYY-MM-DD". Sequelize lo devuelve como
// string; si llegara como Date, representa la medianoche UTC de ese día, así
// que se toman sus componentes UTC (nunca los locales, que lo correrían).
export const toDateOnlyString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);

// DATEONLY -> "dd/mm/aaaa" sin pasar por un Date local. Antes el PDF hacía
// `new Date("2026-10-22").toLocaleDateString()`: ese string se interpreta
// como medianoche UTC y, visto desde Lima, es el día ANTERIOR — "Válida
// hasta" salía un día antes de lo guardado.
export const formatDateOnlyEsPe = (value: Date | string): string => {
  const [year, month, day] = toDateOnlyString(value).split("-");
  return `${day}/${month}/${year}`;
};

// Instante real (created_at, ahora) -> "dd/mm/aaaa" en hora de Lima.
export const formatInstantDateEsPe = (instant: Date | string): string =>
  businessDateFormatter.format(new Date(instant));

// Instante real -> "dd/mm/aaaa, h:mm a. m." en hora de Lima.
export const formatInstantDateTimeEsPe = (instant: Date | string): string =>
  businessDateTimeFormatter.format(new Date(instant));

// Lima es UTC-5 todo el año (sin horario de verano), así que el offset es fijo.
const BUSINESS_UTC_OFFSET = "-05:00";

// Fecha "YYYY-MM-DD" + hora "HH:mm" escritas por el usuario (hora de Lima) ->
// instante UTC real, para guardar en un DATETIME (ej. cuándo avisar un
// recordatorio).
export const businessLocalToUtc = (dateOnly: string, time: string): Date =>
  new Date(`${dateOnly}T${time}:00${BUSINESS_UTC_OFFSET}`);

const businessTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: BUSINESS_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// Instante UTC -> { date: "YYYY-MM-DD", time: "HH:mm" } en hora de Lima, el
// formato separado que se devuelve al cliente (CLAUDE.md: fechas UTC-5).
export const utcToBusinessParts = (instant: Date | string): { date: string; time: string } => {
  const value = new Date(instant);
  return { date: toBusinessDateOnly(value), time: businessTimeFormatter.format(value) };
};

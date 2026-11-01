import { body, CustomValidator, ValidationChain } from "express-validator";
import { todayInBusinessTz } from "../../utils/dateUtils";

// Reglas compartidas por todo lo que mueve dinero (pagos, gastos, compras,
// movimientos de caja y reposiciones a trabajadores), para que ninguna
// pantalla acepte algo que otra rechaza y Caja no reciba datos que no
// cuadran.

// Tope de DECIMAL(10, 2), la columna de todos los montos.
export const MAX_MONEY_AMOUNT = 99999999.99;

// Fechas anteriores a esto son casi seguro un error de tipeo (ej. 0202 en
// vez de 2026) que dejaría el movimiento perdido fuera de cualquier filtro.
const MIN_MONEY_DATE = "2000-01-01";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Ida y vuelta por Date: Date.parse acepta "2026-02-31" (lo corre al 3 de
// marzo), así que se exige que la fecha reconstruida sea la misma.
const isRealDateOnly = (value: string): boolean => {
  if (!DATE_ONLY_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

// Más de 2 decimales no existe en soles: MySQL redondea en silencio al
// guardar en DECIMAL(10, 2), y lo guardado dejaba de coincidir con lo que la
// persona escribió.
const hasAtMostTwoDecimals = (value: unknown): boolean => /^-?\d+(\.\d{1,2})?$/.test(String(value).trim());

// onlyIf: para campos de un objeto opcional (ej. el adelanto al aceptar): la
// regla solo corre si la condición se cumple.
interface RuleOptions {
  onlyIf?: ValidationChain | CustomValidator;
}

const startChain = (field: string, options: RuleOptions): ValidationChain =>
  options.onlyIf ? body(field).if(options.onlyIf) : body(field);

export const moneyAmountRule = (
  field: string,
  requiredMessage = "El monto debe ser mayor a 0",
  options: RuleOptions = {}
): ValidationChain =>
  startChain(field, options)
    .isFloat({ gt: 0, max: MAX_MONEY_AMOUNT })
    .withMessage(requiredMessage)
    .bail()
    .custom((value: unknown) => {
      if (!hasAtMostTwoDecimals(value)) throw new Error("El monto admite como máximo 2 decimales");
      return true;
    });

// Fecha de un movimiento de dinero: día calendario de Lima (YYYY-MM-DD),
// nunca futura — el dinero todavía no se movió — y nunca absurda. Se
// compara como texto contra "hoy en Lima": comparar instantes UTC dejaba
// pasar la fecha de mañana a partir de las 7 p. m. de Lima.
export const moneyDateRule = (field: string, requiredMessage: string, options: RuleOptions = {}): ValidationChain =>
  startChain(field, options)
    .isString()
    .withMessage(requiredMessage)
    .bail()
    .custom((value: string) => {
      if (!isRealDateOnly(value)) throw new Error("La fecha no es válida (formato AAAA-MM-DD)");
      if (value < MIN_MONEY_DATE) throw new Error("La fecha no es válida");
      if (value > todayInBusinessTz()) throw new Error("La fecha no puede ser una fecha futura");
      return true;
    });

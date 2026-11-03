import { QueryTypes, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import {
  addDaysToDateOnly,
  capitalizeEs,
  formatDateOnlyEsPe,
  formatPeriodEs,
  periodBounds,
  periodOf,
  shiftPeriod,
} from "../../../../../utils/dateUtils";
import { CashClosingIssue, CashPeriodAccountBalance } from "../../types/cash_closing.types";
import { CashPeriodMap, isClosedPeriod } from "../shared/period_state.service";

// Reglas del cierre mensual (plan §4), compartidas por la lista, el detalle
// (blockers/warnings) y el cierre en sí (que lanza la primera que falla).

export const CASH_CLOSING_CODES = {
  ledgerNotStarted: "CASH_LEDGER_NOT_STARTED",
  beforeStart: "CASH_PERIOD_BEFORE_START",
  notEnded: "CASH_PERIOD_NOT_ENDED",
  alreadyClosed: "CASH_PERIOD_ALREADY_CLOSED",
  previousOpen: "CASH_PERIOD_PREVIOUS_OPEN",
  earlierReopened: "CASH_PERIOD_EARLIER_REOPENED",
  notClosed: "CASH_PERIOD_NOT_CLOSED",
  drift: "CASH_PERIOD_DRIFT",
  future: "CASH_PERIOD_IN_FUTURE",
  invalidReason: "INVALID_REASON",
  openingLocked: "CASH_OPENING_LOCKED",
  startPeriodLocked: "CASH_START_PERIOD_LOCKED",
  startPeriodInvalid: "CASH_START_PERIOD_INVALID",
  ledgerConflict: "CASH_LEDGER_CONFLICT",
  companyRequired: "COMPANY_REQUIRED",
} as const;

// Días después del fin de mes en que todavía pueden faltar transferencias.
const LATE_MOVEMENTS_WARNING_DAYS = 5;

export const periodLabel = (period: string): string => formatPeriodEs(period);
const periodTitle = (period: string): string => capitalizeEs(formatPeriodEs(period));

const solesFormatter = new Intl.NumberFormat("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "−S/ 150.00" (signo matemático, como en la UI).
export const formatSolesSigned = (amount: number): string =>
  `${amount < 0 ? "−" : ""}S/ ${solesFormatter.format(Math.abs(amount))}`;

export const ledgerNotStartedError = (): AppError =>
  new AppError(409, "Configura primero el saldo inicial de la caja", undefined, CASH_CLOSING_CODES.ledgerNotStarted);

export interface CloseRuleViolation extends CashClosingIssue {
  status: number;
}

const violation = (status: number, code: string, message: string): CloseRuleViolation => ({ status, code, message });

// Meses reabiertos anteriores a `period` (ascendente).
const reopenedBefore = (map: CashPeriodMap, period: string): string[] =>
  [...map.periods.values()]
    .filter((state) => state.status === "reopened" && state.period < period)
    .map((state) => state.period)
    .sort();

/**
 * Por qué NO se puede cerrar `period` hoy, en el orden del plan (vacío = se
 * puede). Sin libro o antes del inicio no se evalúa nada más.
 */
export function closeRuleViolations(map: CashPeriodMap, period: string, today: string): CloseRuleViolation[] {
  const ledger = map.ledger;
  if (!ledger) return [violation(409, CASH_CLOSING_CODES.ledgerNotStarted, "Configura primero el saldo inicial de la caja")];
  if (period < ledger.startPeriod) {
    return [
      violation(
        400,
        CASH_CLOSING_CODES.beforeStart,
        `${periodTitle(period)} es anterior al inicio de la caja (${periodLabel(ledger.startPeriod)}): no se cierra.`
      ),
    ];
  }

  const violations: CloseRuleViolation[] = [];
  const { end } = periodBounds(period);
  if (end >= today) {
    const opensOn = addDaysToDateOnly(end, 1);
    violations.push(
      violation(
        409,
        CASH_CLOSING_CODES.notEnded,
        `${periodTitle(period)} todavía no termina: podrás cerrarlo desde el ${formatDateOnlyEsPe(opensOn)}.`
      )
    );
  }
  if (isClosedPeriod(map, period)) {
    violations.push(violation(409, CASH_CLOSING_CODES.alreadyClosed, `${periodTitle(period)} ya está cerrado.`));
  }

  const previous = shiftPeriod(period, -1);
  const reopened = reopenedBefore(map, period);
  const previousIsClosed = period === ledger.startPeriod || isClosedPeriod(map, previous);
  const previousIsReopened = map.periods.get(previous)?.status === "reopened";
  if (!previousIsClosed && !previousIsReopened) {
    violations.push(
      violation(
        409,
        CASH_CLOSING_CODES.previousOpen,
        `Los meses se cierran en orden: primero cierra ${periodLabel(previous)}.`
      )
    );
  }
  const firstReopened = reopened[0];
  if (firstReopened !== undefined) {
    violations.push(
      violation(409, CASH_CLOSING_CODES.earlierReopened, `Primero vuelve a cerrar ${periodLabel(firstReopened)}.`)
    );
  }
  return violations;
}

/** Meses cerrados seguidos después de `period` (los que recalcula un re-cierre). */
export function laterClosedChain(map: CashPeriodMap, period: string): string[] {
  const chain: string[] = [];
  let candidate = shiftPeriod(period, 1);
  // Cota explícita: nunca más meses cerrados que filas en el mapa.
  for (let step = 0; step < map.periods.size && isClosedPeriod(map, candidate); step += 1) {
    chain.push(candidate);
    candidate = shiftPeriod(candidate, 1);
  }
  return chain;
}

// Mes cerrado DESPUÉS de un mes reabierto: su saldo inicial se recalculará
// cuando se vuelva a cerrar el reabierto.
export const isProvisionalPeriod = (map: CashPeriodMap, period: string): boolean =>
  isClosedPeriod(map, period) && reopenedBefore(map, period).length > 0;

const joinEs = (items: string[]): string => {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
};

/**
 * Advertencias (no impiden cerrar) de la vista previa de un mes abierto o
 * reabierto: saldos negativos, cierre en los primeros días del mes siguiente
 * y meses que un re-cierre recalcularía.
 */
export function closeWarnings(
  map: CashPeriodMap,
  period: string,
  today: string,
  balances: readonly CashPeriodAccountBalance[]
): CashClosingIssue[] {
  const negatives = balances
    .filter((row) => row.closing < 0)
    .map((row) => ({
      code: "NEGATIVE_BALANCE",
      message: `${row.account_name} terminaría en ${formatSolesSigned(row.closing)}. Revisa si falta registrar un ingreso o si el saldo inicial es correcto.`,
    }));

  const { end } = periodBounds(period);
  const isRecent = today > end && today <= addDaysToDateOnly(end, LATE_MOVEMENTS_WARNING_DAYS);
  const recent = isRecent
    ? [
        {
          code: "RECENT_PERIOD_END",
          message: `Es posible que aún falten movimientos de ${formatPeriodEs(period).split(" ")[0]} (transferencias por confirmar).`,
        },
      ]
    : [];

  const later = map.periods.get(period)?.status === "reopened" ? laterClosedChain(map, period) : [];
  const recalculation =
    later.length > 0
      ? [{ code: "RECALCULATES_LATER", message: `Se recalcularán los saldos de ${joinEs(later.map(periodLabel))}.` }]
      : [];

  return [...negatives, ...recent, ...recalculation];
}

/** Mes actual (Lima) — la lista de cierres llega hasta acá. */
export const currentPeriodOf = (today: string): string => periodOf(today);

/** Nombre completo de varios usuarios (una consulta). */
export async function loadUserNames(ids: number[], transaction?: Transaction): Promise<Map<number, string>> {
  const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  if (unique.length === 0) return new Map();
  const rows = await DataBase.instance.sequelize.query<{ id: number | string; full_name: string | null }>(
    "SELECT id, CONCAT(name, ' ', paternal_lastname) AS full_name FROM user WHERE id IN (:ids)",
    { type: QueryTypes.SELECT, replacements: { ids: unique }, transaction }
  );
  return new Map(rows.map((row) => [Number(row.id), row.full_name ?? ""]));
}

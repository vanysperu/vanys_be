import { Transaction } from "sequelize";
import {
  MoneyCorrectionKind,
  MoneyCorrectionSource,
  MoneyCorrectionValues,
} from "../../api/modules/money_correction/types/money_correction.types";
import { CashChangeResult, CashEffect } from "../../api/modules/cash_closing/types/cash_closing.types";
import {
  acquireLedgerShareLock,
  CashPeriodMap,
  closedPeriodSet,
  findPeriodShareLocked,
  firstOpenDate,
  isClosedDate,
  loadPeriodMap,
} from "../../api/modules/cash_closing/services/shared/period_state.service";
import {
  insertAdjustmentLegs,
  loadRowHolds,
  planAdjustmentLegs,
  planReleaseLegs,
} from "../../api/modules/cash_closing/services/shared/adjustment_entries.service";
import { loadCashEffects } from "../../api/modules/cash_movement/services/shared/cash_effects.service";
import { AppError } from "../errors/AppError";
import { WriteScope } from "../rbac/writeScope";
import { capitalizeEs, formatDateOnlyEsPe, formatPeriodEs, periodOf, todayInBusinessTz } from "../../utils/dateUtils";

export type { CashChangeResult } from "../../api/modules/cash_closing/types/cash_closing.types";

// Cierre mensual de caja (fase 2). Dos puntos de entrada, ambos DENTRO de la
// transacción del service y DESPUÉS de sus propios locks de filas de negocio
// (el libro se bloquea siempre al final: plan §2.4, sin ciclos de deadlock):
//
//   - assertCashPeriodOpen: CREAR. 409 CASH_PERIOD_CLOSED si la fecha cae en
//     un mes cerrado.
//   - beginCashChange + complete: CORREGIR / ANULAR / RESTAURAR. Nunca
//     bloquea por estar en un mes cerrado: la fila se corrige en el lugar y,
//     si su efecto en caja de un mes cerrado cambia, se registran dos patas
//     de ajuste (hold en la fecha original, posting hoy) con su motivo.
//
// Sin libro (cash_ledger) para la empresa = sin ninguna restricción: todo
// funciona exactamente como en la fase 1.
//
// Fecha a pasar por fuente (día calendario de Lima, YYYY-MM-DD):
//   manual                 → occurred_at   (movesCash = true)
//   quotation_payment      → paid_at       (true)
//   quotation_expense      → spent_at      (funding_source === 'company'; gasto manual = true)
//   employee_debt          → incurred_at   (false: no mueve caja, nunca se bloquea)
//   employee_debt_payment  → paid_at       (true)

export const CASH_CLOSING_ERROR_CODES = {
  periodClosed: "CASH_PERIOD_CLOSED",
  adjustForbidden: "CASH_PERIOD_ADJUST_FORBIDDEN",
  adjustmentReasonRequired: "ADJUSTMENT_REASON_REQUIRED",
} as const;

export interface CashPeriodCheck {
  companyId: number;
  date: string;
  source: MoneyCorrectionSource;
  movesCash: boolean;
  transaction: Transaction;
}

// ---------------------------------------------------------------------------
// Errores (mensajes del plan §2.1/§2.2).
// ---------------------------------------------------------------------------

const createInClosedPeriodError = (period: string, openDate: string): AppError =>
  new AppError(
    409,
    `${capitalizeEs(formatPeriodEs(period))} ya está cerrado: no se pueden registrar ni mover movimientos a esa fecha. ` +
      `Usa una fecha desde el ${formatDateOnlyEsPe(openDate)} o pide a un administrador que reabra el mes.`,
    { period, first_open_date: openDate },
    CASH_CLOSING_ERROR_CODES.periodClosed
  );

const moveIntoClosedPeriodError = (map: CashPeriodMap, date: string): AppError => {
  const period = periodOf(date);
  return new AppError(
    409,
    `La nueva fecha cae en ${formatPeriodEs(period)}, que ya está cerrado. ` +
      "La fecha solo puede quedarse igual o pasar a un mes abierto.",
    { period, first_open_date: firstOpenDate(map, period) },
    CASH_CLOSING_ERROR_CODES.periodClosed
  );
};

// `reopened`: las patas solo liberan ajustes previos de un mes REABIERTO
// (planReleaseLegs); el mensaje no puede decir que el mes está cerrado.
const adjustForbiddenError = (period: string, reopened: boolean): AppError =>
  new AppError(
    403,
    reopened
      ? `Este movimiento tiene un ajuste de cierre de ${formatPeriodEs(period)} (mes reabierto). Solo un administrador ` +
          "puede cambiar su efecto en caja (se registrará como un ajuste en el mes abierto)."
      : `Este movimiento es de ${formatPeriodEs(period)}, que ya está cerrado. Solo un administrador puede corregirlo ` +
          "o anularlo (se registrará como un ajuste en el mes abierto).",
    { period },
    CASH_CLOSING_ERROR_CODES.adjustForbidden
  );

const reasonRequiredError = (period: string, reopened: boolean): AppError =>
  new AppError(
    400,
    `Este movimiento es de ${formatPeriodEs(period)} (${reopened ? "mes reabierto con un ajuste de cierre" : "mes cerrado"}): ` +
      "indica el motivo del ajuste (mínimo 5 caracteres).",
    { period },
    CASH_CLOSING_ERROR_CODES.adjustmentReasonRequired
  );

// ---------------------------------------------------------------------------
// Crear.
// ---------------------------------------------------------------------------

/**
 * Guard de los CREAR: 409 CASH_PERIOD_CLOSED si `date` cae en un mes cerrado
 * de la empresa. No hace nada si la fila no mueve caja, si la empresa no
 * configuró la caja, si la fecha es anterior al mes de inicio o si el mes
 * está abierto o reabierto.
 */
export async function assertCashPeriodOpen({ companyId, date, movesCash, transaction }: CashPeriodCheck): Promise<void> {
  // Deudas manuales y compras pagadas por un trabajador: no mueven caja.
  if (!movesCash) return;

  const ledger = await acquireLedgerShareLock(companyId, transaction);
  if (!ledger) return;
  if (date < ledger.startDate) return;

  const period = periodOf(date);
  const state = await findPeriodShareLocked(companyId, period, transaction);
  if (state?.status !== "closed") return;

  // Solo para armar el mensaje ("Usa una fecha desde el …").
  const map = await loadPeriodMap(companyId, transaction, "none");
  throw createInClosedPeriodError(period, firstOpenDate(map, period));
}

// ---------------------------------------------------------------------------
// Corregir / anular / restaurar.
// ---------------------------------------------------------------------------

export interface BeginCashChangeInput {
  companyId: number;
  source: MoneyCorrectionSource;
  sourceId: number; // id de la fila de Caja (compra = quotation_expense_id)
  oldDate: string; // YYYY-MM-DD; en anular/restaurar, ambas = fecha de la fila
  newDate: string;
  // ¿La fila mueve caja DESPUÉS del cambio? (anular → false, restaurar → true,
  // compra → next.funding_source === 'company', corregir → true)
  movesCashAfter: boolean;
  scope: WriteScope; // canAdjustClosedPeriods decide si puede ajustar un mes cerrado
  actorId: number; // auditoría de las patas
  transaction: Transaction;
}

// Registra el historial de la corrección con el `kind` que corresponde y
// devuelve su id (money_correction.id), o null si no registró nada (un
// anular/restaurar sin ajuste, o sin motivo).
export type RecordCashChangeHistory = (kind: MoneyCorrectionKind) => Promise<number | null>;

export interface CashChange {
  // Pre-cálculo antes de mutar: ¿la fila tiene (o tendrá) efecto en un mes
  // cerrado? Sirve para pedir el motivo de un anular/restaurar antes de tocar
  // nada. El veredicto final lo da complete() (puede no haber patas si lo
  // que cambió no mueve caja: descripción, categoría, notas...).
  readonly requiresAdjustment: boolean;
  readonly closedPeriod: string | null; // YYYY-MM del mes cerrado afectado
  complete(recordHistory: RecordCashChangeHistory): Promise<CashChangeResult>;
}

const EMPTY_RESULT = (kind: MoneyCorrectionKind): CashChangeResult => ({
  kind,
  adjustedPeriod: null,
  affectedPeriods: [],
  postedDate: null,
  entriesCount: 0,
});

// Una sola llamada a complete() por cambio: llamarla dos veces duplicaría patas.
const onceGuard = () => {
  let used = false;
  return () => {
    if (used) throw new Error("CashChange.complete() ya se llamó para este cambio");
    used = true;
  };
};

// Sin libro: siempre una corrección normal, sin patas.
const noOpChange = (): CashChange => {
  const markUsed = onceGuard();
  return {
    requiresAdjustment: false,
    closedPeriod: null,
    complete: async (recordHistory) => {
      markUsed();
      await recordHistory("correction");
      return EMPTY_RESULT("correction");
    },
  };
};

const reopenedPeriodSet = (map: CashPeriodMap): Set<string> =>
  new Set([...map.periods.values()].filter((state) => state.status === "reopened").map((state) => state.period));

const firstClosedDateOf = (
  map: CashPeriodMap,
  before: readonly CashEffect[],
  oldDate: string,
  movesCashAfter: boolean
): string | null => {
  const closedBefore = before.find((effect) => isClosedDate(map, effect.date));
  if (closedBefore) return closedBefore.date;
  return movesCashAfter && isClosedDate(map, oldDate) ? oldDate : null;
};

/**
 * Abre un cambio (corregir / anular / restaurar) de una fila de dinero.
 * Llamar DESPUÉS de los locks propios del service y ANTES de mutar:
 *   1. Toma el libro LOCK IN SHARE MODE y lee los meses con lock.
 *   2. 409 CASH_PERIOD_CLOSED si la fecha nueva (distinta de la vieja) cae
 *      en un mes cerrado.
 *   3. Foto "antes" de los efectos en caja de la fila (con lock).
 * Después de mutar (UPDATE, recálculos), llamar UNA vez a `complete`.
 */
export async function beginCashChange(input: BeginCashChangeInput): Promise<CashChange> {
  const { companyId, source, sourceId, oldDate, newDate, movesCashAfter, scope, actorId, transaction } = input;

  const map = await loadPeriodMap(companyId, transaction, "share");
  if (!map.ledger) return noOpChange();

  const before = await loadCashEffects(source, sourceId, transaction);

  // Mover la fecha a un mes cerrado (o a otro día dentro de él): nunca, si
  // hay caja de por medio (antes o después). Una fila que no movía caja y
  // sigue sin moverla (compra pagada por un trabajador) puede cambiar de
  // fecha: no toca ningún saldo cerrado (decisión 3 del usuario).
  const involvesCash = movesCashAfter || before.length > 0;
  if (involvesCash && newDate !== oldDate && isClosedDate(map, newDate)) throw moveIntoClosedPeriodError(map, newDate);
  const firstClosedDate = firstClosedDateOf(map, before, oldDate, movesCashAfter);
  const markUsed = onceGuard();

  return {
    requiresAdjustment: firstClosedDate !== null,
    closedPeriod: firstClosedDate === null ? null : periodOf(firstClosedDate),
    complete: async (recordHistory) => {
      markUsed();
      const after = await loadCashEffects(source, sourceId, transaction);

      // Un efecto en un mes cerrado solo puede quedar en la fecha que ya tenía.
      const allowedClosedDates = new Set([oldDate, ...before.map((effect) => effect.date)]);
      const misplaced = after.find((effect) => isClosedDate(map, effect.date) && !allowedClosedDates.has(effect.date));
      if (misplaced) throw moveIntoClosedPeriodError(map, misplaced.date);

      const today = todayInBusinessTz();
      // Meses reabiertos: si la fila cambia su caja ahí, se liberan sus holds
      // previas para que el mes refleje lo vivo (QA M1, ver planReleaseLegs).
      const reopened = reopenedPeriodSet(map);
      const holds = await loadRowHolds(companyId, source, sourceId, [...reopened], transaction);
      const legs = [
        ...planAdjustmentLegs(before, after, closedPeriodSet(map), today),
        ...planReleaseLegs(before, after, holds, reopened, today),
      ];
      const firstLeg = legs[0];
      if (!firstLeg) {
        await recordHistory("correction");
        return EMPTY_RESULT("correction");
      }

      // Hay que tocar un ajuste de cierre: solo con el permiso de ajustar.
      const firstIsReopened = reopened.has(firstLeg.affectedPeriod);
      if (!scope.canAdjustClosedPeriods) throw adjustForbiddenError(firstLeg.affectedPeriod, firstIsReopened);

      const correctionId = await recordHistory("adjustment");
      if (correctionId === null) throw reasonRequiredError(firstLeg.affectedPeriod, firstIsReopened);

      const entriesCount = await insertAdjustmentLegs({
        companyId,
        moneyCorrectionId: correctionId,
        source,
        sourceId,
        legs,
        actorId,
        transaction,
      });
      const affectedPeriods = [...new Set(legs.map((leg) => leg.affectedPeriod))].sort();
      return {
        kind: "adjustment",
        adjustedPeriod: firstLeg.affectedPeriod,
        affectedPeriods,
        postedDate: today,
        entriesCount,
      };
    },
  };
}

/**
 * Valores del historial de un anular/restaurar registrado como ajuste:
 * anular = { is_deleted: 0 } → { is_deleted: 1 }; restaurar, al revés.
 */
export const toggleAdjustmentValues = (
  nextIsDeleted: boolean
): { previous: MoneyCorrectionValues; next: MoneyCorrectionValues } => ({
  previous: { is_deleted: nextIsDeleted ? 0 : 1 },
  next: { is_deleted: nextIsDeleted ? 1 : 0 },
});

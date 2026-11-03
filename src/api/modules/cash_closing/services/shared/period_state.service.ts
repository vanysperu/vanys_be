import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { periodBounds, periodOf, shiftPeriod, toDateOnlyString } from "../../../../../utils/dateUtils";
import { CashLedgerModel } from "../../model/cash_ledger.model";
import { CashPeriodModel } from "../../model/cash_period.model";
import { CashPeriodStatus, CashPeriodStoredStatus, CashRowPeriodStatus } from "../../types/cash_closing.types";

// Estado del libro de caja de una empresa (cash_ledger + cash_period) y sus
// lecturas con lock. Estrategia de locks (plan §2.4, sin ciclos):
//   - Escrituras de dinero: primero sus filas de negocio, AL FINAL el libro
//     LOCK IN SHARE MODE ('share'). Los SHARE son compatibles entre sí: dos
//     escrituras no se bloquean.
//   - Cerrar / reabrir / saldo inicial: transacción READ COMMITTED cuya
//     PRIMERA sentencia es el libro FOR UPDATE ('update'); después solo
//     lecturas planas y escrituras en tablas cash_*.
// Sin cache a propósito: un cache no puede convivir con estos locks.

export interface CashLedgerState {
  id: number;
  companyId: number;
  startPeriod: string; // YYYY-MM
  startDate: string; // YYYY-MM-DD
  notes: string | null;
}

export interface CashPeriodState {
  id: number;
  period: string;
  status: CashPeriodStoredStatus;
  closeCount: number;
}

export interface CashPeriodMap {
  ledger: CashLedgerState | null;
  periods: ReadonlyMap<string, CashPeriodState>; // solo meses con fila (cerrados al menos una vez)
}

// none = lectura plana (listados); share = escritura de dinero; update = cierre/reapertura/saldo inicial.
export type LedgerLockMode = "none" | "share" | "update";

const toLedgerState = (row: CashLedgerModel): CashLedgerState => ({
  id: Number(row.id),
  companyId: Number(row.company_id),
  startPeriod: row.start_period,
  startDate: toDateOnlyString(row.start_date),
  notes: row.notes,
});

const toPeriodState = (row: CashPeriodModel): CashPeriodState => ({
  id: Number(row.id),
  period: row.period,
  status: row.status,
  closeCount: Number(row.close_count),
});

const lockOption = (transaction: Transaction | undefined, mode: LedgerLockMode) => {
  if (!transaction || mode === "none") return undefined;
  return mode === "share" ? transaction.LOCK.SHARE : transaction.LOCK.UPDATE;
};

/** Libro de la empresa (o null), con el lock pedido. */
export async function findCashLedger(
  companyId: number,
  transaction?: Transaction,
  mode: LedgerLockMode = "none"
): Promise<CashLedgerState | null> {
  const row = await DataBase.instance.cash_ledger.findOne({
    where: { company_id: companyId },
    transaction,
    lock: lockOption(transaction, mode),
  });
  return row ? toLedgerState(row) : null;
}

/**
 * Lock de una ESCRITURA de dinero: lectura plana primero y, solo si hay libro,
 * re-lectura LOCK IN SHARE MODE. Sin libro no se toma ningún lock (un lock
 * sobre una fila inexistente bloquearía el hueco del índice): un "configurar
 * caja" concurrente no cierra ningún mes, así que no hay nada que proteger.
 */
export async function acquireLedgerShareLock(
  companyId: number,
  transaction: Transaction
): Promise<CashLedgerState | null> {
  const plain = await findCashLedger(companyId, transaction, "none");
  if (!plain) return null;
  return findCashLedger(companyId, transaction, "share");
}

/** Lock de cierre/reapertura/saldo inicial: PRIMERA sentencia de su transacción. */
export async function lockLedgerForUpdate(companyId: number, transaction: Transaction): Promise<CashLedgerState | null> {
  return findCashLedger(companyId, transaction, "update");
}

/**
 * Fila de UN mes con LOCK IN SHARE MODE (null = el mes nunca se cerró). Tiene
 * que ser una lectura con lock: con REPEATABLE READ una lectura plana podría
 * ver una foto vieja ("abierto") después de esperar a que el cierre confirme.
 */
export async function findPeriodShareLocked(
  companyId: number,
  period: string,
  transaction: Transaction
): Promise<CashPeriodState | null> {
  const row = await DataBase.instance.cash_period.findOne({
    where: { company_id: companyId, period },
    transaction,
    lock: transaction.LOCK.SHARE,
  });
  return row ? toPeriodState(row) : null;
}

/**
 * Libro + meses de la empresa (12 filas por año, una consulta).
 *   - 'none': lecturas planas (listado de Caja, /status).
 *   - 'share': escrituras de dinero (libro y meses con LOCK IN SHARE MODE).
 *   - 'update': cierre/reapertura/saldo inicial (libro FOR UPDATE; los meses
 *     se leen planos porque nadie más puede cambiarlos mientras se tiene el libro).
 */
export async function loadPeriodMap(
  companyId: number,
  transaction?: Transaction,
  mode: LedgerLockMode = "none"
): Promise<CashPeriodMap> {
  const ledger =
    mode === "share" && transaction
      ? await acquireLedgerShareLock(companyId, transaction)
      : await findCashLedger(companyId, transaction, mode);
  if (!ledger) return { ledger: null, periods: new Map() };

  const rows = await DataBase.instance.cash_period.findAll({
    where: { company_id: companyId },
    order: [["period", "ASC"]],
    transaction,
    lock: mode === "share" && transaction ? transaction.LOCK.SHARE : undefined,
  });
  return { ledger, periods: new Map(rows.map((row) => [row.period, toPeriodState(row)])) };
}

// Meses con estado 'closed' (un mes reabierto cuenta como abierto).
export const closedPeriodSet = (map: CashPeriodMap): Set<string> =>
  new Set([...map.periods.values()].filter((state) => state.status === "closed").map((state) => state.period));

export const isClosedPeriod = (map: CashPeriodMap, period: string): boolean =>
  map.periods.get(period)?.status === "closed";

// ¿La fecha (YYYY-MM-DD) cae en un mes cerrado? Antes del inicio o sin libro: no.
export const isClosedDate = (map: CashPeriodMap, date: string): boolean => {
  if (!map.ledger || date < map.ledger.startDate) return false;
  return isClosedPeriod(map, periodOf(date));
};

// Estado del mes de una fila de Caja (para el ícono de candado).
export const periodStatusOfDate = (map: CashPeriodMap, date: string): CashRowPeriodStatus => {
  if (!map.ledger) return "no_ledger";
  if (date < map.ledger.startDate) return "pre_ledger";
  return map.periods.get(periodOf(date))?.status ?? "open";
};

/**
 * Primer día DESPUÉS de `period` que no cae en un mes cerrado (salta los
 * meses cerrados consecutivos). Para el mensaje "Usa una fecha desde el …".
 */
export const firstOpenDate = (map: CashPeriodMap, period: string): string => {
  let candidate = shiftPeriod(period, 1);
  // Cota explícita: nunca hay más meses cerrados seguidos que filas en el mapa.
  for (let step = 0; step <= map.periods.size && isClosedPeriod(map, candidate); step += 1) {
    candidate = shiftPeriod(candidate, 1);
  }
  return periodBounds(candidate).start;
};

/** Respuesta de GET /cash-closing/status (y `cash_period` del listado de Caja). */
export const buildCashPeriodStatus = (map: CashPeriodMap, today: string): CashPeriodStatus => {
  const states = [...map.periods.values()].sort((a, b) => a.period.localeCompare(b.period));
  const closed = states.filter((state) => state.status === "closed").map((state) => state.period);
  const reopened = states.filter((state) => state.status === "reopened").map((state) => state.period);
  const lastClosed = closed[closed.length - 1];
  return {
    started: map.ledger !== null,
    start_period: map.ledger?.startPeriod ?? null,
    start_date: map.ledger?.startDate ?? null,
    first_open_date: lastClosed === undefined ? null : periodBounds(shiftPeriod(lastClosed, 1)).start,
    closed_periods: closed,
    reopened_periods: reopened,
    today,
  };
};

import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { formatSoles } from "../../../../../core/utils/money";
import { formatPeriodEs, nowUtc, periodBounds, todayInBusinessTz } from "../../../../../utils/dateUtils";
import { CashPeriodDetail, CloseCashPeriodInput } from "../../types/cash_closing.types";
import { CashPeriodMap, CashPeriodState, loadPeriodMap } from "../shared/period_state.service";
import { computePeriodBalances, loadStoredBalances, snapshotOf, totalsOf } from "../shared/balances.service";
import { getCashPeriodDetail, sortBalances } from "../find/detail.service";
import { CASH_CLOSING_CODES, closeRuleViolations, laterClosedChain } from "../find/period_rules.service";
import {
  driftedAccounts,
  insertPeriodEvent,
  logCashClosing,
  totalsColumns,
  upsertPeriodBalances,
  withStoredAccounts,
} from "./period_writes";

interface RecalculateInput {
  companyId: number;
  reclosedPeriod: string;
  map: CashPeriodMap;
  actorId: number;
  now: Date;
  transaction: Transaction;
}

/**
 * Después de re-cerrar un mes, recalcula cada mes cerrado SEGUIDO posterior,
 * en orden: su saldo inicial pasa a ser el nuevo cierre del anterior y su
 * cierre se recalcula. Sus ingresos, egresos y ajustes NO pueden cambiar
 * (I5): si cambian es un bug → 409 CASH_PERIOD_DRIFT y se revierte todo.
 * Se detiene en el primer mes no cerrado (un reabierto posterior recalcula
 * los suyos cuando se vuelva a cerrar).
 */
async function recalculateLaterPeriods({ companyId, reclosedPeriod, map, actorId, now, transaction }: RecalculateInput) {
  const later = laterClosedChain(map, reclosedPeriod);
  for (const period of later) {
    const state = map.periods.get(period);
    if (!state) break;
    const stored = await loadStoredBalances(state.id, transaction);
    const fresh = withStoredAccounts(await computePeriodBalances(companyId, period, map, transaction), stored);

    const drifted = driftedAccounts(stored, fresh);
    if (drifted.length > 0) {
      console.error(
        `[cash_closing] DRIFT en ${period} (empresa ${companyId}) al re-cerrar ${reclosedPeriod}: cuentas ${drifted.join(", ")}`
      );
      throw new AppError(
        409,
        `Los movimientos de ${formatPeriodEs(period)} cambiaron después de su cierre: no se puede recalcular. Avisa a soporte.`,
        { period, account_keys: drifted },
        CASH_CLOSING_CODES.drift
      );
    }

    const balances = sortBalances(fresh);
    await DataBase.instance.cash_period.update(
      { ...totalsColumns(totalsOf(balances)), updated_by: actorId, updated_at: now },
      { where: { id: state.id }, transaction }
    );
    await upsertPeriodBalances({ companyId, cashPeriodId: state.id, balances, actorId, now, transaction });
    await insertPeriodEvent({
      companyId,
      period,
      action: "recalculate",
      reason: `Saldos recalculados por el nuevo cierre de ${formatPeriodEs(reclosedPeriod)}`,
      previousSnapshot: snapshotOf(period, sortBalances([...stored.values()])),
      snapshot: snapshotOf(period, balances),
      actorId,
      now,
      transaction,
    });
  }
  return later;
}

// El mapa con `period` ya cerrado (para que el recálculo de los meses
// siguientes tome su nuevo cierre como saldo inicial).
const withClosed = (map: CashPeriodMap, state: CashPeriodState): CashPeriodMap => ({
  ledger: map.ledger,
  periods: new Map(map.periods).set(state.period, { ...state, status: "closed" }),
});

/**
 * Cierra (o vuelve a cerrar) un mes (PUT /cash-closing/close/:period).
 * Transacción READ COMMITTED cuya PRIMERA sentencia es el libro FOR UPDATE:
 * espera a que terminen las escrituras de dinero en curso (sus filas entran
 * al cierre) y las que lleguen después ven el mes cerrado. Después solo lee y
 * escribe tablas cash_* (nunca bloquea filas de negocio: sin ciclos).
 */
export async function closeCashPeriod({ companyId, period, notes, actorId }: CloseCashPeriodInput): Promise<CashPeriodDetail> {
  await DataBase.instance.sequelize.transaction(
    { isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED },
    async (transaction) => {
      const map = await loadPeriodMap(companyId, transaction, "update");
      const [firstViolation] = closeRuleViolations(map, period, todayInBusinessTz());
      if (firstViolation) {
        throw new AppError(firstViolation.status, firstViolation.message, { period }, firstViolation.code);
      }

      const now = nowUtc();
      const existing = await DataBase.instance.cash_period.findOne({ where: { company_id: companyId, period }, transaction });
      const stored = existing ? await loadStoredBalances(Number(existing.id), transaction) : new Map();
      const balances = sortBalances(withStoredAccounts(await computePeriodBalances(companyId, period, map, transaction), stored));
      const totals = totalsOf(balances);
      const closeNotes = notes?.trim() ? notes.trim().slice(0, 500) : null;
      const { start, end } = periodBounds(period);

      let cashPeriodId: number;
      if (existing) {
        cashPeriodId = Number(existing.id);
        await DataBase.instance.cash_period.update(
          {
            ...totalsColumns(totals),
            status: "closed",
            close_count: Number(existing.close_count) + 1,
            closed_by: actorId,
            closed_at: now,
            close_notes: closeNotes,
            updated_by: actorId,
            updated_at: now,
          },
          { where: { id: cashPeriodId }, transaction }
        );
      } else {
        const created = await DataBase.instance.cash_period.create(
          {
            company_id: companyId,
            period,
            period_start: start,
            period_end: end,
            status: "closed",
            ...totalsColumns(totals),
            close_count: 1,
            closed_by: actorId,
            closed_at: now,
            close_notes: closeNotes,
            reopened_by: null,
            reopened_at: null,
            reopen_reason: null,
            created_by: actorId,
            created_at: now,
            updated_by: actorId,
            updated_at: now,
          },
          { transaction }
        );
        cashPeriodId = Number(created.id);
      }
      await upsertPeriodBalances({ companyId, cashPeriodId, balances, actorId, now, transaction });

      const isReclose = existing !== null;
      const recalculated = isReclose
        ? await recalculateLaterPeriods({
            companyId,
            reclosedPeriod: period,
            map: withClosed(map, { id: cashPeriodId, period, status: "closed", closeCount: Number(existing.close_count) + 1 }),
            actorId,
            now,
            transaction,
          })
        : [];

      const previousSnapshot = isReclose ? snapshotOf(period, sortBalances([...stored.values()])) : null;
      await insertPeriodEvent({
        companyId,
        period,
        action: isReclose ? "reclose" : "close",
        reason: closeNotes,
        previousSnapshot,
        snapshot: snapshotOf(period, balances),
        actorId,
        now,
        transaction,
      });

      const closingNote = previousSnapshot
        ? `saldo final de ${formatSoles(previousSnapshot.totals.closing)} a ${formatSoles(totals.closing)}`
        : `saldo final ${formatSoles(totals.closing)}`;
      const recalculatedNote = recalculated.length > 0 ? `; recalculó ${recalculated.join(", ")}` : "";
      await logCashClosing({
        actorId,
        companyId,
        description: `${isReclose ? "Volvió a cerrar" : "Cerró"} la caja de ${formatPeriodEs(period)} (${closingNote}${recalculatedNote}).`,
        transaction,
      });
    }
  );

  return getCashPeriodDetail(companyId, period);
}

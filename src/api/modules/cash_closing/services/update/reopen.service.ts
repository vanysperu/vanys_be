import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { capitalizeEs, formatPeriodEs, nowUtc } from "../../../../../utils/dateUtils";
import { CashPeriodDetail, ReopenCashPeriodInput } from "../../types/cash_closing.types";
import { loadPeriodMap } from "../shared/period_state.service";
import { loadStoredBalances, snapshotOf } from "../shared/balances.service";
import { getCashPeriodDetail, sortBalances } from "../find/detail.service";
import { CASH_CLOSING_CODES, ledgerNotStartedError } from "../find/period_rules.service";
import { insertPeriodEvent, logCashClosing } from "./period_writes";

export const REOPEN_REASON_MIN = 5;
export const REOPEN_REASON_MAX = 500;

/**
 * Reabre un mes cerrado (PUT /cash-closing/reopen/:period): vuelve a dejar
 * registrar y corregir directamente movimientos de ese mes. Los meses
 * cerrados después siguen cerrados (sus filas siguen protegidas) y su saldo
 * inicial pasa a ser provisional hasta que se vuelva a cerrar este. Mismo
 * patrón de lock que el cierre (libro FOR UPDATE primero, READ COMMITTED).
 */
export async function reopenCashPeriod({ companyId, period, reason, actorId }: ReopenCashPeriodInput): Promise<CashPeriodDetail> {
  await DataBase.instance.sequelize.transaction(
    { isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED },
    async (transaction) => {
      const map = await loadPeriodMap(companyId, transaction, "update");
      if (!map.ledger) throw ledgerNotStartedError();

      const row = await DataBase.instance.cash_period.findOne({ where: { company_id: companyId, period }, transaction });
      if (!row || row.status !== "closed") {
        throw new AppError(
          409,
          `${capitalizeEs(formatPeriodEs(period))} no está cerrado: no hay nada que reabrir.`,
          { period },
          CASH_CLOSING_CODES.notClosed
        );
      }

      const trimmed = (reason ?? "").trim();
      if (trimmed.length < REOPEN_REASON_MIN || trimmed.length > REOPEN_REASON_MAX) {
        throw new AppError(
          400,
          `Indica el motivo de la reapertura (entre ${REOPEN_REASON_MIN} y ${REOPEN_REASON_MAX} caracteres).`,
          undefined,
          CASH_CLOSING_CODES.invalidReason
        );
      }

      const now = nowUtc();
      await DataBase.instance.cash_period.update(
        {
          status: "reopened",
          reopened_by: actorId,
          reopened_at: now,
          reopen_reason: trimmed,
          updated_by: actorId,
          updated_at: now,
        },
        { where: { id: row.id }, transaction }
      );

      const stored = await loadStoredBalances(Number(row.id), transaction);
      await insertPeriodEvent({
        companyId,
        period,
        action: "reopen",
        reason: trimmed,
        previousSnapshot: null,
        snapshot: snapshotOf(period, sortBalances([...stored.values()])),
        actorId,
        now,
        transaction,
      });
      await logCashClosing({
        actorId,
        companyId,
        description: `Reabrió la caja de ${formatPeriodEs(period)}. Motivo: ${trimmed}`,
        transaction,
      });
    }
  );

  return getCashPeriodDetail(companyId, period);
}

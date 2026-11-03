import { QueryTypes, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { capitalizeEs, formatPeriodEs, periodBounds, periodOf, todayInBusinessTz } from "../../../../../utils/dateUtils";
import { CASH_ACCOUNT_KEY, CashPeriodAccountBalance, CashPeriodDetail } from "../../types/cash_closing.types";
import { CashPeriodMap, loadPeriodMap } from "../shared/period_state.service";
import { computePeriodBalances, loadStoredBalances, totalsOf } from "../shared/balances.service";
import { buildListItem, userIdsOfRows } from "./list.service";
import {
  CASH_CLOSING_CODES,
  closeRuleViolations,
  closeWarnings,
  ledgerNotStartedError,
  loadUserNames,
} from "./period_rules.service";

// Efectivo primero; después las cuentas por nombre.
export const sortBalances = (balances: CashPeriodAccountBalance[]): CashPeriodAccountBalance[] =>
  [...balances].sort((a, b) => {
    if (a.account_key === b.account_key) return 0;
    if (a.account_key === CASH_ACCOUNT_KEY) return -1;
    if (b.account_key === CASH_ACCOUNT_KEY) return 1;
    return a.account_name.localeCompare(b.account_name, "es");
  });

/**
 * Valida que `period` exista en la caja de la empresa: hay libro, no es
 * anterior al inicio ni posterior al mes actual (Lima).
 */
export function assertPeriodInLedger(map: CashPeriodMap, period: string, today: string): void {
  if (!map.ledger) throw ledgerNotStartedError();
  if (period < map.ledger.startPeriod) {
    throw new AppError(
      400,
      `${capitalizeEs(formatPeriodEs(period))} es anterior al inicio de la caja (${formatPeriodEs(map.ledger.startPeriod)}).`,
      undefined,
      CASH_CLOSING_CODES.beforeStart
    );
  }
  if (period > periodOf(today)) {
    throw new AppError(
      400,
      `${capitalizeEs(formatPeriodEs(period))} todavía no empieza.`,
      undefined,
      CASH_CLOSING_CODES.future
    );
  }
}

interface CountRow {
  posted: number | string | null;
  affecting: number | string | null;
}

// Patas posting con fecha en el mes (ajustes de meses anteriores registrados
// acá) y patas hold que protegen este mes (correcciones posteriores al cierre).
async function countAdjustments(companyId: number, period: string, transaction?: Transaction) {
  const { start, end } = periodBounds(period);
  const [row] = await DataBase.instance.sequelize.query<CountRow>(
    `SELECT COALESCE(SUM(e.leg = 'posting' AND e.entry_date BETWEEN :start AND :end), 0) AS posted,
            COALESCE(SUM(e.leg = 'hold' AND e.affected_period = :period), 0) AS affecting
     FROM cash_adjustment_entry e
     WHERE e.company_id = :companyId
       AND ((e.leg = 'posting' AND e.entry_date BETWEEN :start AND :end) OR (e.leg = 'hold' AND e.affected_period = :period))`,
    { type: QueryTypes.SELECT, replacements: { companyId, period, start, end }, transaction }
  );
  return { adjustments_posted: Number(row?.posted ?? 0), adjustments_affecting: Number(row?.affecting ?? 0) };
}

/**
 * Detalle de un mes (GET /cash-closing/find/:period):
 *   - cerrado → la foto guardada (cash_period_balance);
 *   - abierto o reabierto → vista previa en vivo (is_preview), con lo que
 *     impide cerrarlo (blockers) y advertencias (warnings).
 */
export async function getCashPeriodDetail(
  companyId: number,
  period: string,
  transaction?: Transaction
): Promise<CashPeriodDetail> {
  const today = todayInBusinessTz();
  const map = await loadPeriodMap(companyId, transaction);
  assertPeriodInLedger(map, period, today);

  const row = await DataBase.instance.cash_period.findOne({ where: { company_id: companyId, period }, transaction });
  const userNames = await loadUserNames(row ? userIdsOfRows([row]) : [], transaction);
  const item = buildListItem(map, period, today, row ?? undefined, userNames);
  const isPreview = item.status !== "closed";

  const balances =
    isPreview || !row
      ? await computePeriodBalances(companyId, period, map, transaction)
      : sortBalances([...(await loadStoredBalances(Number(row.id), transaction)).values()]);

  const blockers = isPreview
    ? closeRuleViolations(map, period, today).map(({ code, message }) => ({ code, message }))
    : [];
  const warnings = isPreview ? closeWarnings(map, period, today, balances) : [];
  const { start, end } = periodBounds(period);

  return {
    ...item,
    // Vista previa: totales en vivo (los guardados de un reabierto son del
    // último cierre); cerrado: los guardados.
    totals: isPreview ? totalsOf(balances) : item.totals,
    period_start: start,
    period_end: end,
    is_preview: isPreview,
    close_notes: row?.close_notes ?? null,
    balances,
    blockers,
    warnings,
    counts: await countAdjustments(companyId, period, transaction),
  };
}

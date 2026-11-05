import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { buildPaginationMeta, PaginatedResult } from "../../../../../core/utils/paginate";
import { formatPeriodEs, periodOf, shiftPeriod, todayInBusinessTz, utcToBusinessParts } from "../../../../../utils/dateUtils";
import { CashPeriodModel } from "../../model/cash_period.model";
import { CashClosingListItem, CashPeriodTotals } from "../../types/cash_closing.types";
import { CashPeriodMap, loadPeriodMap } from "../shared/period_state.service";
import { closeRuleViolations, isProvisionalPeriod, loadUserNames } from "./period_rules.service";
import { financesForPeriods } from "../shared/period_finance.service";

const totalsOfRow = (row: CashPeriodModel): CashPeriodTotals => ({
  opening: Number(row.opening_total),
  income: Number(row.income_total),
  expense: Number(row.expense_total),
  adjustments: Number(row.adjustment_total),
  closing: Number(row.closing_total),
});

// Ids de usuario que la fila necesita para mostrar nombres.
export const userIdsOfRows = (rows: readonly CashPeriodModel[]): number[] =>
  rows.flatMap((row) => [Number(row.closed_by), row.reopened_by === null ? 0 : Number(row.reopened_by)]);

/**
 * Una fila de la lista de cierres (también la base del detalle). `row` = la
 * fila de cash_period del mes, si alguna vez se cerró.
 */
export function buildListItem(
  map: CashPeriodMap,
  period: string,
  today: string,
  row: CashPeriodModel | undefined,
  userNames: Map<number, string>
): CashClosingListItem {
  const status = map.periods.get(period)?.status ?? "open";
  const violations = status === "closed" ? [] : closeRuleViolations(map, period, today);
  const closable = status !== "closed" && violations.length === 0;
  return {
    period,
    label: formatPeriodEs(period),
    status,
    closable,
    blocked_reason: closable || status === "closed" ? null : (violations[0]?.message ?? null),
    is_provisional: isProvisionalPeriod(map, period),
    totals: row ? totalsOfRow(row) : null,
    close_count: row ? Number(row.close_count) : 0,
    closed_by_name: row ? (userNames.get(Number(row.closed_by)) ?? null) : null,
    closed_at: row ? utcToBusinessParts(row.closed_at) : null,
    reopened_by_name: row?.reopened_by ? (userNames.get(Number(row.reopened_by)) ?? null) : null,
    reopened_at: row?.reopened_at ? utcToBusinessParts(row.reopened_at) : null,
    reopen_reason: row?.reopen_reason ?? null,
    // Lo completan la lista y el detalle (financesForPeriods), en una tanda.
    finance: null,
  };
}

/**
 * Meses desde el inicio de la caja hasta el mes actual (Lima), del más
 * reciente al más antiguo, paginado. Es una lista calculada: un mes sin fila
 * en cash_period está abierto. Sin caja configurada, la lista está vacía.
 */
export async function listCashClosings({
  companyId,
  page,
  limit,
  transaction,
}: {
  companyId: number;
  page: number;
  limit: number;
  transaction?: Transaction;
}): Promise<PaginatedResult<CashClosingListItem>> {
  const map = await loadPeriodMap(companyId, transaction);
  const today = todayInBusinessTz();
  if (!map.ledger) return { data: [], meta: buildPaginationMeta(0, page, limit) };

  const currentPeriod = periodOf(today);
  const startPeriod = map.ledger.startPeriod;
  // Cantidad de meses entre el inicio y el actual (ambos incluidos).
  const [startYear = 0, startMonth = 1] = startPeriod.split("-").map(Number);
  const [currentYear = 0, currentMonth = 1] = currentPeriod.split("-").map(Number);
  const total = Math.max(0, (currentYear - startYear) * 12 + (currentMonth - startMonth) + 1);

  const offset = (page - 1) * limit;
  const count = Math.max(0, Math.min(limit, total - offset));
  const periods = Array.from({ length: count }, (_, index) => shiftPeriod(currentPeriod, -(offset + index)));

  const rows =
    periods.length === 0
      ? []
      : await DataBase.instance.cash_period.findAll({ where: { company_id: companyId, period: periods }, transaction });
  const rowByPeriod = new Map(rows.map((row) => [row.period, row]));
  const userNames = await loadUserNames(userIdsOfRows(rows), transaction);

  const items = periods.map((period) => buildListItem(map, period, today, rowByPeriod.get(period), userNames));
  const finances = await financesForPeriods(companyId, items);
  return {
    data: items.map((item) => ({ ...item, finance: finances.get(item.period) ?? null })),
    meta: buildPaginationMeta(total, page, limit),
  };
}

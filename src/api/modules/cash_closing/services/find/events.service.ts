import { Op } from "sequelize";
import { DataBase } from "../../../../../database";
import { buildPaginationMeta, PaginatedResult } from "../../../../../core/utils/paginate";
import { todayInBusinessTz, utcToBusinessParts } from "../../../../../utils/dateUtils";
import { CashPeriodEventItem, CashPeriodEventSnapshot } from "../../types/cash_closing.types";
import { loadPeriodMap } from "../shared/period_state.service";
import { assertPeriodInLedger } from "./detail.service";
import { loadUserNames } from "./period_rules.service";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// MySQL devuelve JSON parseado; MariaDB (JSON = LONGTEXT), como texto.
// Solo se acepta un objeto con la forma de una foto (balances u openings).
const parseSnapshot = (raw: unknown): CashPeriodEventSnapshot | null => {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!isPlainObject(parsed)) return null;
  const looksLikeSnapshot = Array.isArray(parsed.balances) || Array.isArray(parsed.openings);
  return looksLikeSnapshot ? (parsed as unknown as CashPeriodEventSnapshot) : null;
};

/**
 * Rastro de un mes (más reciente primero), paginado: cierres, re-cierres,
 * reaperturas y recálculos. En el mes de inicio también aparecen los cambios
 * del saldo inicial (eventos sin mes).
 */
export async function listPeriodEvents({
  companyId,
  period,
  page,
  limit,
}: {
  companyId: number;
  period: string;
  page: number;
  limit: number;
}): Promise<PaginatedResult<CashPeriodEventItem>> {
  const map = await loadPeriodMap(companyId);
  assertPeriodInLedger(map, period, todayInBusinessTz());

  const isStartPeriod = map.ledger?.startPeriod === period;
  const periodFilter = isStartPeriod
    ? { [Op.or]: [{ period }, { period: null, action: "opening_set" as const }] }
    : { period };

  const { rows, count } = await DataBase.instance.cash_period_event.findAndCountAll({
    where: { company_id: companyId, ...periodFilter },
    order: [
      ["created_at", "DESC"],
      ["id", "DESC"],
    ],
    limit,
    offset: (page - 1) * limit,
  });
  const names = await loadUserNames(rows.map((row) => Number(row.created_by)));

  const data = rows.map(
    (row): CashPeriodEventItem => ({
      id: Number(row.id),
      period: row.period,
      action: row.action,
      reason: row.reason,
      snapshot: parseSnapshot(row.snapshot),
      previous_snapshot: parseSnapshot(row.previous_snapshot),
      created_by: Number(row.created_by),
      created_by_name: names.get(Number(row.created_by)) ?? null,
      created_at: utcToBusinessParts(row.created_at),
    })
  );

  return { data, meta: buildPaginationMeta(count, page, limit) };
}

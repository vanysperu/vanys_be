import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";
import { buildPaginationMeta, PaginatedResult } from "../../../../../core/utils/paginate";
import { formatPeriodEs, periodBounds, toDateOnlyString, todayInBusinessTz, utcToBusinessParts } from "../../../../../utils/dateUtils";
import { ADJUSTMENT_ENTRY_FROM_SQL } from "../../../cash_movement/services/shared/cash_flow.sql";
import { parseMoneyCorrectionValues } from "../../../money_correction/services/find/money_correction.service";
import { MoneyCorrectionSource } from "../../../money_correction/types/money_correction.types";
import {
  CashAdjustmentAction,
  CashAdjustmentLegType,
  CashDirection,
  CashPeriodAdjustmentItem,
} from "../../types/cash_closing.types";
import { loadPeriodMap } from "../shared/period_state.service";
import { assertPeriodInLedger } from "./detail.service";

// posted    = patas posting registradas en este mes (ajustes de meses anteriores);
// affecting = patas hold que protegen este mes (correcciones hechas después
//             de cerrarlo; su diferencia se registró en `posted_date`).
export type CashPeriodAdjustmentType = "posted" | "affecting";

// Campo agregado por WP-A sobre el tipo de WP0: fecha en que se registró la
// diferencia (la de las patas posting de la misma corrección).
export interface CashPeriodAdjustmentListItem extends CashPeriodAdjustmentItem {
  posted_date: string;
}

interface RawLegRow {
  id: number | string;
  money_correction_id: number | string;
  source_type: MoneyCorrectionSource;
  source_id: number | string;
  leg: CashAdjustmentLegType;
  affected_period: string;
  entry_date: string | Date;
  direction: CashDirection;
  amount: string | number;
  payment_account_id: number | string | null;
  payment_account_name: string | null;
  business_unit_id: number | string | null;
  quotation_id: number | string | null;
  purchase_order_id: number | string | null;
  reason: string;
  new_values: unknown;
  created_by_name: string | null;
  created_at: Date;
  posted_date: string | Date | null;
}

const nullableNumber = (value: number | string | null): number | null => (value === null ? null : Number(value));

const actionOf = (newValues: Record<string, unknown>): CashAdjustmentAction => {
  if (!("is_deleted" in newValues)) return "correction";
  return Number(newValues.is_deleted) === 1 ? "annul" : "restore";
};

// Texto fijo por tipo (nunca un valor del usuario interpolado).
const TYPE_CONDITION: Record<CashPeriodAdjustmentType, string> = {
  posted: "e.leg = 'posting' AND e.entry_date BETWEEN :start AND :end",
  affecting: "e.leg = 'hold' AND e.affected_period = :period",
};

export async function listPeriodAdjustments({
  companyId,
  period,
  type,
  page,
  limit,
}: {
  companyId: number;
  period: string;
  type: CashPeriodAdjustmentType;
  page: number;
  limit: number;
}): Promise<PaginatedResult<CashPeriodAdjustmentListItem>> {
  const map = await loadPeriodMap(companyId);
  assertPeriodInLedger(map, period, todayInBusinessTz());

  const { start, end } = periodBounds(period);
  const replacements = { companyId, period, start, end, limit, offset: (page - 1) * limit };
  const condition = TYPE_CONDITION[type];

  const [countRow] = await DataBase.instance.sequelize.query<{ total: number | string }>(
    `SELECT COUNT(*) AS total FROM cash_adjustment_entry e WHERE e.company_id = :companyId AND ${condition}`,
    { type: QueryTypes.SELECT, replacements }
  );

  const rows = await DataBase.instance.sequelize.query<RawLegRow>(
    `SELECT e.id, e.money_correction_id, e.source_type, e.source_id, e.leg, e.affected_period, e.entry_date,
            e.direction, e.amount, e.payment_account_id, pa.name AS payment_account_name, e.business_unit_id,
            e.quotation_id, e.purchase_order_id, mc.reason, mc.new_values,
            CONCAT(u.name, ' ', u.paternal_lastname) AS created_by_name, e.created_at,
            (SELECT MAX(pe.entry_date) FROM cash_adjustment_entry pe
              WHERE pe.money_correction_id = e.money_correction_id AND pe.leg = 'posting') AS posted_date
     FROM ${ADJUSTMENT_ENTRY_FROM_SQL}
     LEFT JOIN user u ON u.id = mc.created_by
     WHERE e.company_id = :companyId AND ${condition}
     ORDER BY e.entry_date DESC, e.id DESC
     LIMIT :limit OFFSET :offset`,
    { type: QueryTypes.SELECT, replacements }
  );

  const data = rows.map((row): CashPeriodAdjustmentListItem => {
    const amount = Number(row.amount);
    const entryDate = toDateOnlyString(row.entry_date);
    const accountId = nullableNumber(row.payment_account_id);
    return {
      id: Number(row.id),
      money_correction_id: Number(row.money_correction_id),
      source_type: row.source_type,
      source_id: Number(row.source_id),
      leg: row.leg,
      action: actionOf(parseMoneyCorrectionValues(row.new_values, row.source_type)),
      affected_period: row.affected_period,
      affected_period_label: formatPeriodEs(row.affected_period),
      entry_date: entryDate,
      direction: row.direction,
      amount,
      net_effect: row.direction === "income" ? amount : -amount,
      payment_account_id: accountId,
      payment_account_name: accountId === null ? "Efectivo" : (row.payment_account_name ?? "Cuenta"),
      business_unit_id: nullableNumber(row.business_unit_id),
      quotation_id: nullableNumber(row.quotation_id),
      purchase_order_id: nullableNumber(row.purchase_order_id),
      reason: row.reason,
      created_by_name: row.created_by_name,
      created_at: utcToBusinessParts(row.created_at),
      posted_date: row.posted_date === null ? entryDate : toDateOnlyString(row.posted_date),
    };
  });

  return { data, meta: buildPaginationMeta(Number(countRow?.total ?? 0), page, limit) };
}

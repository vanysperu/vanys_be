import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";
import { buildPaginationMeta, PaginatedResult } from "../../../../../core/utils/paginate";
import { ReminderBox, ReminderDto, ReminderStatusFilter } from "../../types/reminder.types";
import { REMINDER_SELECT, ReminderRow, toReminderDto } from "../shared/reminder_mapper";

export interface ReminderListFilter {
  actorId: number;
  box: ReminderBox;
  status: ReminderStatusFilter;
  // Fecha de aviso (YYYY-MM-DD, hora de Lima).
  dateFrom?: string;
  dateTo?: string;
  page: number;
  limit: number;
}

// Condición SQL por estado. Texto fijo de este archivo, nunca del usuario.
const STATUS_CONDITION: Record<ReminderStatusFilter, string> = {
  active: "rm.is_deleted = false",
  upcoming: "rm.is_deleted = false AND rm.read_at IS NULL AND rm.remind_at > UTC_TIMESTAMP()",
  due: "rm.is_deleted = false AND rm.read_at IS NULL AND rm.remind_at <= UTC_TIMESTAMP()",
  read: "rm.is_deleted = false AND rm.read_at IS NOT NULL",
  cancelled: "rm.is_deleted = true",
};

// Cada usuario ve SOLO sus recordatorios: los que le llegan o los que creó.
// No hay una vista "de toda la empresa": un recordatorio es personal.
const BOX_CONDITION: Record<ReminderBox, string> = {
  received: "rm.recipient_user_id = :actorId",
  sent: "rm.created_by = :actorId",
};

export async function listRemindersService(filter: ReminderListFilter): Promise<PaginatedResult<ReminderDto>> {
  const now = new Date();
  const conditions = [BOX_CONDITION[filter.box], STATUS_CONDITION[filter.status]];
  // remind_at es UTC: se pasa a hora de Lima antes de comparar el día.
  if (filter.dateFrom) conditions.push("DATE(CONVERT_TZ(rm.remind_at, '+00:00', '-05:00')) >= :dateFrom");
  if (filter.dateTo) conditions.push("DATE(CONVERT_TZ(rm.remind_at, '+00:00', '-05:00')) <= :dateTo");
  const whereClause = conditions.join(" AND ");

  const replacements = {
    actorId: filter.actorId,
    dateFrom: filter.dateFrom ?? null,
    dateTo: filter.dateTo ?? null,
  };

  const [countRow] = (await DataBase.instance.sequelize.query(
    `SELECT COUNT(*) AS total FROM reminder rm WHERE ${whereClause}`,
    { type: QueryTypes.SELECT, replacements }
  )) as { total: number }[];

  const rows = (await DataBase.instance.sequelize.query(
    `${REMINDER_SELECT}
     WHERE ${whereClause}
     ORDER BY rm.remind_at DESC, rm.id DESC
     LIMIT :limit OFFSET :offset`,
    {
      type: QueryTypes.SELECT,
      replacements: { ...replacements, limit: filter.limit, offset: (filter.page - 1) * filter.limit },
    }
  )) as ReminderRow[];

  return {
    data: rows.map((row) => toReminderDto(row, now)),
    meta: buildPaginationMeta(Number(countRow?.total ?? 0), filter.page, filter.limit),
  };
}

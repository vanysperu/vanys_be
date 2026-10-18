import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";
import { ReminderDto } from "../../types/reminder.types";
import { REMINDER_SELECT, ReminderRow, toReminderDto } from "../shared/reminder_mapper";

// Tope de avisos que muestra la campana; el resto se ve en /recordatorios.
const DUE_LIMIT = 20;

export interface DueRemindersResult {
  data: ReminderDto[];
  // Total real de avisos vencidos sin leer (puede ser mayor que data.length).
  total: number;
}

// "¿Qué me toca que me recuerden AHORA?": vencidos, sin leer y no
// cancelados. El frontend lo consulta cada minuto — usa el índice
// idx_reminder_recipient_due (ver migración create-reminder).
export async function getDueRemindersService(actorId: number): Promise<DueRemindersResult> {
  const now = new Date();
  const whereClause =
    "rm.recipient_user_id = :actorId AND rm.is_deleted = false AND rm.read_at IS NULL AND rm.remind_at <= UTC_TIMESTAMP()";

  const [countRow] = (await DataBase.instance.sequelize.query(
    `SELECT COUNT(*) AS total FROM reminder rm WHERE ${whereClause}`,
    { type: QueryTypes.SELECT, replacements: { actorId } }
  )) as { total: number }[];

  const rows = (await DataBase.instance.sequelize.query(
    `${REMINDER_SELECT} WHERE ${whereClause} ORDER BY rm.remind_at DESC, rm.id DESC LIMIT :limit`,
    { type: QueryTypes.SELECT, replacements: { actorId, limit: DUE_LIMIT } }
  )) as ReminderRow[];

  return { data: rows.map((row) => toReminderDto(row, now)), total: Number(countRow?.total ?? 0) };
}

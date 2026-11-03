import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";
import { ReminderDto } from "../../types/reminder.types";
import { REMINDER_SELECT, ReminderRow, toReminderDto } from "../shared/reminder_mapper";

// Tope de avisos sin leer que se devuelven para el toast; el resto se ve en
// /recordatorios.
const DUE_LIMIT = 20;
// Últimos avisos que lista la campana, vistos o no (pedido explícito del
// usuario: "que se listen en la campanita, al menos las últimas 10").
const RECENT_LIMIT = 10;

export interface DueRemindersResult {
  // Vencidos SIN leer: el frontend muestra un toast por cada uno nuevo.
  data: ReminderDto[];
  // Total real de avisos vencidos sin leer (el número de la campana; puede
  // ser mayor que data.length).
  total: number;
  // Los últimos avisos que ya sonaron, leídos o no: la lista de la campana.
  // Antes un aviso desaparecía de la campana al marcarlo como visto.
  recent: ReminderDto[];
}

// "¿Qué me toca que me recuerden AHORA?": vencidos, sin leer y no
// cancelados, más los últimos que ya sonaron. Una sola llamada para la
// campana (cada 5 minutos y al abrirla) — usa el índice
// idx_reminder_recipient_due (ver migración create-reminder).
export async function getDueRemindersService(actorId: number): Promise<DueRemindersResult> {
  const now = new Date();
  const soundedClause = "rm.recipient_user_id = :actorId AND rm.is_deleted = false AND rm.remind_at <= UTC_TIMESTAMP()";
  const unreadClause = `${soundedClause} AND rm.read_at IS NULL`;

  const [[countRow], unreadRows, recentRows] = await Promise.all([
    DataBase.instance.sequelize.query(`SELECT COUNT(*) AS total FROM reminder rm WHERE ${unreadClause}`, {
      type: QueryTypes.SELECT,
      replacements: { actorId },
    }) as Promise<{ total: number }[]>,
    DataBase.instance.sequelize.query(
      `${REMINDER_SELECT} WHERE ${unreadClause} ORDER BY rm.remind_at DESC, rm.id DESC LIMIT :limit`,
      { type: QueryTypes.SELECT, replacements: { actorId, limit: DUE_LIMIT } }
    ) as Promise<ReminderRow[]>,
    DataBase.instance.sequelize.query(
      `${REMINDER_SELECT} WHERE ${soundedClause} ORDER BY rm.remind_at DESC, rm.id DESC LIMIT :limit`,
      { type: QueryTypes.SELECT, replacements: { actorId, limit: RECENT_LIMIT } }
    ) as Promise<ReminderRow[]>,
  ]);

  return {
    data: unreadRows.map((row) => toReminderDto(row, now)),
    total: Number(countRow?.total ?? 0),
    recent: recentRows.map((row) => toReminderDto(row, now)),
  };
}

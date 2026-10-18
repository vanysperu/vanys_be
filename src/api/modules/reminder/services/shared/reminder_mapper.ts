import { utcToBusinessParts } from "../../../../../utils/dateUtils";
import { ReminderDto, ReminderState } from "../../types/reminder.types";

// Fila cruda de las consultas del módulo (reminder + nombres de destinatario
// y creador). Todas las consultas seleccionan exactamente estas columnas.
export interface ReminderRow {
  id: number;
  title: string;
  message: string | null;
  remind_at: Date;
  read_at: Date | null;
  is_deleted: number | boolean;
  recipient_user_id: number;
  recipient_name: string;
  recipient_lastname: string | null;
  created_by: number;
  creator_name: string;
  creator_lastname: string | null;
  created_at: Date;
}

export const REMINDER_SELECT = `
  SELECT rm.id, rm.title, rm.message, rm.remind_at, rm.read_at, rm.is_deleted,
         rm.recipient_user_id, ru.name AS recipient_name, ru.paternal_lastname AS recipient_lastname,
         rm.created_by, cu.name AS creator_name, cu.paternal_lastname AS creator_lastname, rm.created_at
  FROM reminder rm
  INNER JOIN \`user\` ru ON ru.id = rm.recipient_user_id
  INNER JOIN \`user\` cu ON cu.id = rm.created_by`;

const fullName = (name: string, lastname: string | null) => [name, lastname].filter(Boolean).join(" ");

export const deriveReminderState = (row: Pick<ReminderRow, "remind_at" | "read_at" | "is_deleted">, now: Date): ReminderState => {
  if (row.is_deleted) return "cancelled";
  if (row.read_at) return "read";
  return new Date(row.remind_at) <= now ? "due" : "upcoming";
};

// Fechas guardadas en UTC -> fecha y hora de Lima separadas, recién al salir.
export const toReminderDto = (row: ReminderRow, now: Date = new Date()): ReminderDto => {
  const remindParts = utcToBusinessParts(row.remind_at);
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    remind_date: remindParts.date,
    remind_time: remindParts.time,
    state: deriveReminderState(row, now),
    read_at: row.read_at ? utcToBusinessParts(row.read_at) : null,
    recipient: { id: row.recipient_user_id, name: fullName(row.recipient_name, row.recipient_lastname) },
    creator: { id: row.created_by, name: fullName(row.creator_name, row.creator_lastname) },
    created_at: utcToBusinessParts(row.created_at),
  };
};

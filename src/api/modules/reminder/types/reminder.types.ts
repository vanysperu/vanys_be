// Estado derivado de un recordatorio (no es una columna: sale de remind_at,
// read_at e is_deleted).
//   upcoming  -> todavía no llega su hora
//   due       -> ya llegó su hora y el destinatario no lo vio
//   read      -> el destinatario lo marcó como visto
//   cancelled -> quien lo creó lo canceló
export type ReminderState = "upcoming" | "due" | "read" | "cancelled";

// Filtro de estado del listado: "active" (por defecto) = todo lo no cancelado.
export type ReminderStatusFilter = "active" | ReminderState;

// "received" = los que me llegan a mí; "sent" = los que yo creé (para mí o
// para otro).
export type ReminderBox = "received" | "sent";

export interface ReminderPerson {
  id: number;
  name: string;
}

export interface ReminderRecipient extends ReminderPerson {
  is_me: boolean;
}

export interface ReminderDto {
  id: number;
  title: string;
  message: string | null;
  // Fecha y hora de aviso, separadas y en hora de Lima (CLAUDE.md: fechas UTC-5).
  remind_date: string;
  remind_time: string;
  state: ReminderState;
  read_at: { date: string; time: string } | null;
  recipient: ReminderPerson;
  creator: ReminderPerson;
  created_at: { date: string; time: string };
}

export interface ReminderInputDto {
  title: string;
  message?: string | null;
  // Hora de Lima escrita por el usuario.
  remind_date: string;
  remind_time: string;
  // Vacío = uno mismo.
  recipient_user_id?: number | null;
}

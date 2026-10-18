import { IToken } from "../../../../interfaces/IToken.interface";
import { ReminderRecipient } from "../../types/reminder.types";
import { findEligibleRecipients } from "../shared/recipient.service";

// Lista para el selector "¿A quién se lo recuerdo?": usuarios activos de la
// propia empresa con acceso a Recordatorios (máx. 200, filtrable por nombre).
// Endpoint propio porque el listado de usuarios es solo para administradores
// y un Gestor también debe poder avisarle a un compañero.
export async function listReminderRecipientsService(actor: IToken, search?: string): Promise<ReminderRecipient[]> {
  const rows = await findEligibleRecipients({ actor, search });
  return rows.map((row) => ({
    id: row.id,
    name: [row.name, row.paternal_lastname].filter(Boolean).join(" "),
    // El frontend no conoce el id del usuario logueado: así puede mostrar "Yo".
    is_me: row.id === actor.userId,
  }));
}

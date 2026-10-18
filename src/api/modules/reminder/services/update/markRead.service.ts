import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { nowUtc } from "../../../../../utils/dateUtils";
import { ReminderDto } from "../../types/reminder.types";
import { getReminderDtoById } from "../find/getById.service";

// El destinatario marca el aviso como visto: deja de aparecer en la campana.
// Idempotente: marcarlo dos veces no cambia la fecha en que se vio.
export async function markReminderReadService(id: number, actorId: number): Promise<ReminderDto> {
  const reminder = await DataBase.instance.reminder.findOne({ where: { id } });
  if (!reminder) throw new AppError(404, "El recordatorio no existe");
  if (reminder.recipient_user_id !== actorId) throw new AppError(403, "Este recordatorio no es para ti");
  if (reminder.is_deleted) throw new AppError(409, "El recordatorio fue cancelado");

  if (!reminder.read_at) {
    const now = nowUtc();
    await DataBase.instance.reminder.update({ read_at: now, updated_by: actorId, updated_at: now }, { where: { id } });
  }

  return getReminderDtoById(id);
}

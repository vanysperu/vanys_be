import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { nowUtc } from "../../../../../utils/dateUtils";
import { ReminderDto } from "../../types/reminder.types";
import { getReminderDtoById } from "../find/getById.service";

// Cancelar/reactivar (toggle sobre is_deleted, mismo patrón que el resto de
// módulos). Solo quien lo creó: el destinatario lo "cierra" marcándolo visto.
export async function toggleReminderService(id: number, actorId: number): Promise<ReminderDto> {
  const reminder = await DataBase.instance.reminder.findOne({ where: { id } });
  if (!reminder) throw new AppError(404, "El recordatorio no existe");
  if (reminder.created_by !== actorId) throw new AppError(403, "Solo quien creó el recordatorio puede cancelarlo");

  await DataBase.instance.reminder.update(
    { is_deleted: !reminder.is_deleted, updated_by: actorId, updated_at: nowUtc() },
    { where: { id } }
  );

  return getReminderDtoById(id);
}

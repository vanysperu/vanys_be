import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { nowUtc } from "../../../../../utils/dateUtils";
import { IToken } from "../../../../interfaces/IToken.interface";
import { ReminderDto, ReminderInputDto } from "../../types/reminder.types";
import { getReminderDtoById } from "../find/getById.service";
import { resolveRecipient } from "../shared/recipient.service";
import { resolveRemindAt } from "../shared/remind_at";

// Solo quien creó el recordatorio puede editarlo, y solo mientras nadie lo
// haya visto ni esté cancelado (cambiarlo después reescribiría algo que el
// destinatario ya leyó).
export async function updateReminderService(id: number, dto: ReminderInputDto, actor: IToken): Promise<ReminderDto> {
  const reminder = await DataBase.instance.reminder.findOne({ where: { id } });
  if (!reminder) throw new AppError(404, "El recordatorio no existe");
  if (reminder.created_by !== actor.userId) throw new AppError(403, "Solo quien creó el recordatorio puede editarlo");
  if (reminder.is_deleted) throw new AppError(409, "El recordatorio está cancelado: reactívalo antes de editarlo");
  if (reminder.read_at) throw new AppError(409, "El recordatorio ya fue visto: crea uno nuevo");

  const recipient = await resolveRecipient(actor, dto.recipient_user_id);
  const remindAt = resolveRemindAt(dto.remind_date, dto.remind_time);

  await DataBase.instance.reminder.update(
    {
      company_id: recipient.company_id,
      recipient_user_id: recipient.id,
      title: dto.title.trim(),
      message: dto.message?.trim() || null,
      remind_at: remindAt,
      updated_by: actor.userId,
      updated_at: nowUtc(),
    },
    { where: { id } }
  );

  return getReminderDtoById(id);
}

import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { IToken } from "../../../../interfaces/IToken.interface";
import { ReminderDto, ReminderInputDto } from "../../types/reminder.types";
import { getReminderDtoById } from "../find/getById.service";
import { resolveRecipient } from "../shared/recipient.service";
import { resolveRemindAt } from "../shared/remind_at";

export async function createReminderService(dto: ReminderInputDto, actor: IToken): Promise<ReminderDto> {
  const recipient = await resolveRecipient(actor, dto.recipient_user_id);
  const remindAt = resolveRemindAt(dto.remind_date, dto.remind_time);
  const now = nowUtc();

  const created = await DataBase.instance.reminder.create({
    id: 0,
    // La empresa sale del destinatario validado, nunca del body.
    company_id: recipient.company_id,
    recipient_user_id: recipient.id,
    title: dto.title.trim(),
    message: dto.message?.trim() || null,
    remind_at: remindAt,
    read_at: null,
    is_deleted: false,
    created_by: actor.userId,
    created_at: now,
    updated_by: actor.userId,
    updated_at: now,
  });

  return getReminderDtoById(created.id);
}

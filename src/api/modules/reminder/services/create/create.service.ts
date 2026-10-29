import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { IToken } from "../../../../interfaces/IToken.interface";
import { ReminderDto, ReminderInputDto } from "../../types/reminder.types";
import { getReminderDtoById } from "../find/getById.service";
import { resolveRecipient } from "../shared/recipient.service";
import { resolveRemindAt } from "../shared/remind_at";

// Uno o varios destinatarios (selector múltiple al crear, pedido de QA): una
// fila de `reminder` por destinatario, todo o nada dentro de una
// transacción — si uno de los ids no es válido, no se crea ninguno (nunca un
// envío "a medias" sin que el usuario se entere de cuál falló).
export async function createReminderService(dto: ReminderInputDto, actor: IToken): Promise<ReminderDto[]> {
  const requestedIds = dto.recipient_user_ids?.length ? dto.recipient_user_ids : [dto.recipient_user_id ?? null];
  // Sin duplicados: elegir dos veces a la misma persona no debe crear dos
  // avisos idénticos.
  const uniqueIds = [...new Set(requestedIds)];

  const remindAt = resolveRemindAt(dto.remind_date, dto.remind_time);
  const now = nowUtc();
  const title = dto.title.trim();
  const message = dto.message?.trim() || null;

  const transaction = await DataBase.instance.sequelize.transaction();
  try {
    const createdIds: number[] = [];
    for (const recipientUserId of uniqueIds) {
      const recipient = await resolveRecipient(actor, recipientUserId);
      const created = await DataBase.instance.reminder.create(
        {
          id: 0,
          // La empresa sale del destinatario validado, nunca del body.
          company_id: recipient.company_id,
          recipient_user_id: recipient.id,
          title,
          message,
          remind_at: remindAt,
          read_at: null,
          is_deleted: false,
          created_by: actor.userId,
          created_at: now,
          updated_by: actor.userId,
          updated_at: now,
        },
        { transaction }
      );
      createdIds.push(created.id);
    }

    await transaction.commit();
    return Promise.all(createdIds.map((id) => getReminderDtoById(id)));
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

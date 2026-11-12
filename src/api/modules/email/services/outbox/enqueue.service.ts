import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { sealSecret } from "../../../../../core/security/secretBox";
import { EmailTemplateName, EnqueueEmailInput } from "../../types/email.types";
import { scheduleEmailDispatch } from "./dispatch.service";

/**
 * Deja un correo en la cola. Si va dentro de una transacción, se manda recién
 * cuando esta se confirma (si se revierte, el correo tampoco existe). Las
 * variables de la plantilla se guardan cifradas: llevan enlaces de contraseña.
 */
export async function enqueueEmail<T extends EmailTemplateName>(
  input: EnqueueEmailInput<T>,
  transaction?: Transaction
): Promise<number> {
  const now = nowUtc();
  const row = await DataBase.instance.email_outbox.create(
    {
      // 0 = autoincremental (mismo patrón que el resto de los create del proyecto).
      id: 0,
      company_id: input.companyId,
      category: input.category,
      template: input.template,
      to_email: input.to.trim(),
      cc_email: input.cc?.trim() || null,
      reply_to: input.replyTo?.trim() || null,
      subject: input.subject.slice(0, 255),
      payload_encrypted: sealSecret(JSON.stringify(input.payload)),
      status: "pending",
      attempts: 0,
      next_attempt_at: null,
      sent_at: null,
      provider: null,
      provider_message_id: null,
      last_error: null,
      related_type: input.related?.type ?? null,
      related_id: input.related?.id ?? null,
      created_by: input.createdBy,
      created_at: now,
      updated_by: input.createdBy,
      updated_at: now,
    },
    { transaction }
  );

  if (transaction) transaction.afterCommit(() => scheduleEmailDispatch());
  else scheduleEmailDispatch();

  return Number(row.id);
}

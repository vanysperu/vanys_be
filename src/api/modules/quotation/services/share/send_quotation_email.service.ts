import { DataBase } from "../../../../../database";
import { formatDateOnlyEsPe } from "../../../../../utils/dateUtils";
import { formatSoles } from "../../../../../core/utils/money";
import { IToken } from "../../../../interfaces/IToken.interface";
import { enqueueEmail } from "../../../email/services/outbox/enqueue.service";
import { isEmailConfigured } from "../../../email/services/providers/resolve_provider";
import { quotationCode } from "../../../invoice/services/shared/drive_copy";
import { logQuotationEvent } from "../timeline/quotation_event.service";
import { assertShareable, buildPublicQuotationUrl, ensurePublicLink, findReadableQuotation } from "./public_link.shared";

export interface SendQuotationEmailInput {
  to: string;
  cc: string | null;
  subject: string;
  message: string;
  attachPdf: boolean;
}

export interface SendQuotationEmailResult {
  // false = no hay proveedor de correo configurado: no saldrá.
  emailConfigured: boolean;
  // Si el enlace estaba apagado, el correo va solo con el PDF.
  includesLink: boolean;
}

/**
 * Manda la cotización por correo (Sprint 2, ítem 7): enlace a la vista pública
 * (si está encendido) y el PDF adjunto (si se marcó). Sale del dominio de la
 * plataforma con "Responder a" = correo de la empresa, así la respuesta del
 * cliente le llega a ella. Va por la cola de correos (reintentos y cupo diario).
 */
export async function sendQuotationEmailService(
  quotationId: number,
  input: SendQuotationEmailInput,
  actor: IToken
): Promise<SendQuotationEmailResult> {
  const quotation = await findReadableQuotation(quotationId, actor);
  assertShareable(quotation);

  const [client, company] = await Promise.all([
    DataBase.instance.client.findOne({ where: { id: quotation.client_id }, attributes: ["name"] }),
    DataBase.instance.company.findOne({ where: { id: quotation.company_id }, attributes: ["business_name", "email"] }),
  ]);
  const code = quotationCode(quotation.id);

  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const link = await ensurePublicLink(quotation, actor.userId, transaction);
    const includesLink = Boolean(link.enabled);

    await enqueueEmail(
      {
        companyId: quotation.company_id,
        category: "quotation",
        template: "quotation",
        to: input.to,
        cc: input.cc,
        replyTo: company?.email || null,
        subject: input.subject,
        payload: {
          quotationId: quotation.id,
          companyName: company?.business_name ?? "Vanys",
          quotationCode: code,
          clientName: client?.name ?? "",
          total: formatSoles(quotation.total),
          validUntil: quotation.valid_until ? formatDateOnlyEsPe(quotation.valid_until) : null,
          message: input.message,
          link: includesLink ? buildPublicQuotationUrl(link.code) : null,
          attachPdf: input.attachPdf,
        },
        related: { type: "quotation", id: quotation.id },
        createdBy: actor.userId,
      },
      transaction
    );

    const extras = [input.attachPdf ? "con PDF" : null, includesLink ? "con enlace" : null].filter(Boolean).join(" y ");
    await logQuotationEvent({
      quotationId: quotation.id,
      action: "shared_email",
      description: `Enviada por correo a ${input.to}${input.cc ? ` (copia a ${input.cc})` : ""}${extras ? ` ${extras}` : ""}`,
      actorId: actor.userId,
      transaction,
    });

    return { emailConfigured: isEmailConfigured(), includesLink };
  });
}

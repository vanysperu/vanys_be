import { IToken } from "../../../../interfaces/IToken.interface";
import { logQuotationEvent } from "../timeline/quotation_event.service";
import { assertShareable, findReadableQuotation } from "./public_link.shared";

/**
 * Deja en el historial que se abrió WhatsApp para mandar la cotización. Se
 * registra el clic: WhatsApp (enlace wa.me, gratis) no avisa si el mensaje
 * llegó; para eso está "Visto por el cliente".
 */
export async function logWhatsappShareService(quotationId: number, phone: string | null, actor: IToken): Promise<void> {
  const quotation = await findReadableQuotation(quotationId, actor);
  assertShareable(quotation);
  await logQuotationEvent({
    quotationId,
    action: "shared_whatsapp",
    description: phone ? `Enviada por WhatsApp al ${phone}` : "Enviada por WhatsApp",
    actorId: actor.userId,
  });
}

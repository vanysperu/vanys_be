import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { IToken } from "../../../../interfaces/IToken.interface";
import { logQuotationEvent } from "../timeline/quotation_event.service";
import { assertQuotationWritable } from "../shared/quotation_scope";
import { ensurePublicLink, findReadableQuotation, PublicLinkDto, toPublicLinkDto } from "./public_link.shared";

/**
 * Interruptor "Visible para el cliente" (pedido explícito del usuario: "un
 * toggle que siempre esté en on: si lo ponemos off ya no pueden ver la
 * cotización"). Apagado, el enlace muestra "no disponible" y el PDF da 404; al
 * volver a encenderlo, el MISMO enlace funciona otra vez. Alcance de escritura.
 */
export async function setPublicLinkEnabledService(quotationId: number, enabled: boolean, actor: IToken): Promise<PublicLinkDto> {
  await assertQuotationWritable(quotationId, actor, "compartir");
  const quotation = await findReadableQuotation(quotationId, actor);

  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const link = await ensurePublicLink(quotation, actor.userId, transaction);
    if (Boolean(link.enabled) === enabled) return toPublicLinkDto(link);

    const now = nowUtc();
    await link.update({ enabled, updated_by: actor.userId, updated_at: now }, { transaction });
    await logQuotationEvent({
      quotationId,
      action: "public_link_changed",
      description: enabled ? "Se volvió a mostrar al cliente (enlace encendido)" : "Se dejó de mostrar al cliente (enlace apagado)",
      actorId: actor.userId,
      transaction,
    });
    return toPublicLinkDto(link);
  });
}

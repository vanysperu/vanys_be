import { IToken } from "../../../../interfaces/IToken.interface";
import { assertShareable, ensurePublicLink, findReadableQuotation, PublicLinkDto, toPublicLinkDto } from "./public_link.shared";

/**
 * Enlace público de la cotización para compartirla (lo crea la primera vez).
 * Alcance de LECTURA: quien puede ver la cotización puede compartirla.
 */
export async function getPublicLinkService(quotationId: number, actor: IToken): Promise<PublicLinkDto> {
  const quotation = await findReadableQuotation(quotationId, actor);
  assertShareable(quotation);
  const link = await ensurePublicLink(quotation, actor.userId);
  return toPublicLinkDto(link);
}

import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { IToken } from "../../../../interfaces/IToken.interface";
import { logQuotationEvent } from "../timeline/quotation_event.service";
import { assertQuotationWritable } from "../shared/quotation_scope";
import { assertShareable, ensurePublicLink, findReadableQuotation, generatePublicCode, PublicLinkDto, toPublicLinkDto } from "./public_link.shared";

/**
 * "Generar enlace nuevo": anula el anterior para siempre (por si se mandó a la
 * persona equivocada). El nuevo nace encendido y con las vistas en cero.
 */
export async function regeneratePublicLinkService(quotationId: number, actor: IToken): Promise<PublicLinkDto> {
  await assertQuotationWritable(quotationId, actor, "compartir");
  const quotation = await findReadableQuotation(quotationId, actor);
  assertShareable(quotation);

  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const link = await ensurePublicLink(quotation, actor.userId, transaction);
    const now = nowUtc();
    await link.update(
      {
        code: generatePublicCode(),
        enabled: true,
        view_count: 0,
        first_viewed_at: null,
        last_viewed_at: null,
        regenerated_at: now,
        updated_by: actor.userId,
        updated_at: now,
      },
      { transaction }
    );
    await logQuotationEvent({
      quotationId,
      action: "public_link_changed",
      description: "Se generó un enlace nuevo: el anterior ya no funciona",
      actorId: actor.userId,
      transaction,
    });
    return toPublicLinkDto(link);
  });
}

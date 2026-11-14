import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { IToken } from "../../../../interfaces/IToken.interface";
import type { GuideDto } from "../../types/dispatch_guide.types";
import { assertDraft, loadGuideForCaller, toGuideDto } from "./guide_shared";

/**
 * Descarta un BORRADOR (nunca se borra la fila: queda anulado como
 * "borrador descartado"). Lo que llevaba deja de contar como despachado.
 */
export const discardGuideService = async (id: number, user: IToken): Promise<GuideDto> =>
  DataBase.instance.sequelize.transaction(async (transaction) => {
    const guide = await loadGuideForCaller(id, user, "write", transaction);
    assertDraft(guide);
    const now = nowUtc();
    await guide.update(
      { status: "voided", voided_at: now, voided_by: user.userId, void_reason: "Borrador descartado", updated_by: user.userId, updated_at: now },
      { transaction }
    );
    return toGuideDto(guide, transaction);
  });

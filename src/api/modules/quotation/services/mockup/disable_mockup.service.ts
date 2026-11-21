import { IToken } from "../../../../interfaces/IToken.interface";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { assertQuotationWritable } from "../shared/quotation_scope";
import { logQuotationEvent } from "../timeline/quotation_event.service";
import { loadReadableMockup } from "./mockup_shared";

/**
 * Quita un mockup de la cotización (soft-delete, CLAUDE.md §1: `active =
 * false`). Mismo alcance de escritura que subirlo. Estado + evento en una
 * transacción.
 */
export async function disableMockupService(mockupId: number, user: IToken): Promise<{ id: number }> {
  const mockup = await loadReadableMockup(mockupId, user);
  const quotationId = Number(mockup.quotation_id);
  await assertQuotationWritable(quotationId, user, "quitar diseños");

  await DataBase.instance.sequelize.transaction(async (transaction) => {
    await DataBase.instance.quotation_mockup.update(
      { active: false, updated_by: user.userId, updated_at: nowUtc() },
      { where: { id: mockupId }, transaction }
    );
    await logQuotationEvent({
      quotationId,
      action: "mockup_removed",
      description: `Se quitó el diseño "${mockup.caption ?? mockup.file_name}"`,
      actorId: user.userId,
      transaction,
    });
  });
  return { id: mockupId };
}

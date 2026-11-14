import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { IToken } from "../../../../interfaces/IToken.interface";
import type { GuideDto, GuideInput } from "../../types/dispatch_guide.types";
import { buildGuideContent, lockQuotationForGuide, lockTransferForGuide, replaceGuideChildren, type GuideContext } from "./guide_input";
import { assertDraft, loadGuideForCaller, toGuideDto } from "./guide_shared";

/**
 * Edita un BORRADOR. El origen (cotización o transferencia), la empresa y la
 * tienda no cambian: son los de la guía. Una guía registrada ya no se edita
 * (se anula y se arma otra).
 */
export const updateGuideService = async (id: number, input: GuideInput, user: IToken): Promise<GuideDto> =>
  DataBase.instance.sequelize.transaction(async (transaction) => {
    const guide = await loadGuideForCaller(id, user, "write", transaction);
    assertDraft(guide);

    const quotation = guide.quotation_id === null ? null : await lockQuotationForGuide(Number(guide.quotation_id), user, transaction);
    const transfer =
      guide.stock_document_id === null
        ? null
        : (await lockTransferForGuide(Number(guide.stock_document_id), user, Number(guide.id), transaction)).transfer;
    const context: GuideContext = {
      companyId: Number(guide.company_id),
      businessUnitId: guide.business_unit_id === null ? null : Number(guide.business_unit_id),
      quotation,
      transfer,
    };
    const content = await buildGuideContent(input, context, user, Number(guide.id), transaction);
    await guide.update({ ...content.fields, updated_by: user.userId, updated_at: nowUtc() }, { transaction });
    await replaceGuideChildren(Number(guide.id), context.companyId, content, user.userId, transaction);
    return toGuideDto(guide, transaction);
  });

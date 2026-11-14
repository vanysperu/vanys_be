import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { IToken } from "../../../../interfaces/IToken.interface";
import type { GuideDto, GuideInput } from "../../types/dispatch_guide.types";
import { buildGuideContent, replaceGuideChildren, resolveNewGuideContext } from "./guide_input";
import { toGuideDto } from "./guide_shared";

/**
 * Arma una guía en BORRADOR (modo manual, plan §9.4): desde una cotización
 * (Lista o Entregada), una transferencia de almacén (motivo 04) o de cero. La
 * empresa y la tienda salen de la cotización, de la transferencia o de la
 * sesión; nunca del body. Todo en una transacción: si una línea se pasa de lo
 * que falta despachar, no queda nada.
 */
export const createGuideService = async (input: GuideInput, user: IToken): Promise<GuideDto> =>
  DataBase.instance.sequelize.transaction(async (transaction) => {
    const context = await resolveNewGuideContext(input, user, transaction);
    const content = await buildGuideContent(input, context, user, null, transaction);
    const now = nowUtc();
    const guide = await DataBase.instance.dispatch_guide.create(
      {
        id: 0,
        company_id: context.companyId,
        business_unit_id: context.businessUnitId,
        emission_mode: "manual",
        series: null,
        number: null,
        status: "draft",
        issue_date: null,
        quotation_id: context.quotation ? Number(context.quotation.id) : null,
        stock_document_id: context.transfer ? Number(context.transfer.id) : null,
        ...content.fields,
        registered_at: null,
        registered_by: null,
        voided_at: null,
        voided_by: null,
        void_reason: null,
        created_by: user.userId,
        created_at: now,
        updated_by: user.userId,
        updated_at: now,
      },
      { transaction }
    );
    await replaceGuideChildren(Number(guide.id), context.companyId, content, user.userId, transaction);
    return toGuideDto(guide, transaction);
  });

import { DataBase } from "../../../../../database";
import { IToken } from "../../../../interfaces/IToken.interface";
import { nowUtc } from "../../../../../utils/dateUtils";
import { nextDocumentNumber } from "../shared/inventory_shared";
import type { DocumentDto, DocumentInput } from "../../types/inventory.types";
import { replaceDraftLines, toDocumentDtos, validateDocumentInput } from "./document_shared";

// Crea un documento en borrador (todavía no mueve stock). El número se asigna
// acá, correlativo por tipo (NI/NS/TR/AJ).
export const createDocumentService = async (companyId: number, input: DocumentInput, user: IToken): Promise<DocumentDto> => {
  const document = await DataBase.instance.sequelize.transaction(async (transaction) => {
    const { warehouse, target, lines } = await validateDocumentInput(companyId, input, user, transaction);
    const { series, number } = await nextDocumentNumber(companyId, input.doc_type, user.userId, transaction);
    const now = nowUtc();
    const created = await DataBase.instance.stock_document.create(
      {
        id: 0,
        company_id: companyId,
        business_unit_id: warehouse.business_unit_id,
        warehouse_id: warehouse.id,
        target_warehouse_id: target?.id ?? null,
        doc_type: input.doc_type,
        reason_code: input.reason_code,
        series,
        number,
        status: "draft",
        document_date: input.document_date,
        supplier_id: input.supplier_id ?? null,
        client_id: input.client_id ?? null,
        quotation_id: input.quotation_id ?? null,
        reversal_of_id: null,
        notes: input.notes?.trim() || null,
        posted_at: null,
        posted_by: null,
        received_at: null,
        received_by: null,
        cancelled_at: null,
        cancelled_by: null,
        cancel_reason: null,
        created_by: user.userId,
        created_at: now,
        updated_by: user.userId,
        updated_at: now,
      },
      { transaction }
    );
    await replaceDraftLines(companyId, Number(created.id), lines, user.userId, transaction);
    return created;
  });
  const [dto] = await toDocumentDtos([document], user, true);
  return dto as DocumentDto;
};

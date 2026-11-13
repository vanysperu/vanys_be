import { AppError } from "../../../../../core/errors/AppError";
import { DataBase } from "../../../../../database";
import { IToken } from "../../../../interfaces/IToken.interface";
import { nowUtc } from "../../../../../utils/dateUtils";
import type { DocumentDto, DocumentInput } from "../../types/inventory.types";
import { loadDocumentForCaller, replaceDraftLines, toDocumentDtos, validateDocumentInput } from "./document_shared";

// Edita un borrador (lo confirmado nunca se edita: se anula). El tipo y el
// número no cambian.
export const updateDocumentService = async (id: number, input: DocumentInput, user: IToken): Promise<DocumentDto> => {
  const document = await DataBase.instance.sequelize.transaction(async (transaction) => {
    const { document } = await loadDocumentForCaller(id, user, transaction);
    if (document.status !== "draft") throw new AppError(409, "Solo se edita un borrador", undefined, "DOCUMENT_NOT_DRAFT");
    const { warehouse, target, lines } = await validateDocumentInput(
      Number(document.company_id),
      { ...input, doc_type: document.doc_type },
      user,
      transaction
    );
    await document.update(
      {
        business_unit_id: warehouse.business_unit_id,
        warehouse_id: warehouse.id,
        target_warehouse_id: target?.id ?? null,
        reason_code: input.reason_code,
        document_date: input.document_date,
        supplier_id: input.supplier_id ?? null,
        client_id: input.client_id ?? null,
        notes: input.notes?.trim() || null,
        updated_by: user.userId,
        updated_at: nowUtc(),
      },
      { transaction }
    );
    await replaceDraftLines(Number(document.company_id), Number(document.id), lines, user.userId, transaction);
    return document;
  });
  const [dto] = await toDocumentDtos([document], user, true);
  return dto as DocumentDto;
};

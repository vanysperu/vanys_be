import { AppError } from "../../../../../core/errors/AppError";
import { DataBase } from "../../../../../database";
import { IToken } from "../../../../interfaces/IToken.interface";
import { nowUtc } from "../../../../../utils/dateUtils";
import type { DocumentDto } from "../../types/inventory.types";
import { applyMovements, type MovementInput } from "../shared/stock_engine";
import { normalizeDocumentLines, outgoingMovements, resolveEntryLots } from "../shared/document_lines";
import { assertCanOperate, documentNumberText, loadDocumentForCaller, toDocumentDtos } from "./document_shared";

// Confirma un ingreso, una salida o un ajuste: mueve el stock en la misma
// transacción. Una transferencia se confirma despachándola (dispatch).
export const postDocumentService = async (id: number, user: IToken): Promise<DocumentDto> => {
  const document = await DataBase.instance.sequelize.transaction(async (transaction) => {
    const { document, warehouse } = await loadDocumentForCaller(id, user, transaction);
    if (document.doc_type === "transfer") throw new AppError(400, "Una transferencia se confirma al despacharla");
    if (document.status !== "draft") throw new AppError(409, "El documento ya no es un borrador", undefined, "DOCUMENT_NOT_DRAFT");
    assertCanOperate(user, warehouse, "confirmar documentos");
    if (!warehouse.active) throw new AppError(409, "El almacén está deshabilitado");

    const lines = await DataBase.instance.stock_document_line.findAll({ where: { document_id: document.id }, order: [["id", "ASC"]], transaction });
    // Los productos pudieron cambiar desde el borrador (ej. dejaron de manejar stock).
    await normalizeDocumentLines(
      Number(document.company_id),
      document.doc_type,
      lines.map((line) => ({ product_id: Number(line.product_id), color: line.color_key, quantity: Number(line.quantity) })),
      transaction
    );

    const incoming = lines.filter((line) => Number(line.quantity) > 0 && document.doc_type !== "exit");
    const lotByLine = await resolveEntryLots(Number(document.company_id), warehouse, incoming, documentNumberText(document), user.userId, transaction);
    const movements: MovementInput[] = [];
    for (const line of lines) {
      const quantity = Number(line.quantity);
      if (document.doc_type === "exit" || quantity < 0) {
        movements.push(...(await outgoingMovements(warehouse, line, Math.abs(quantity), transaction)));
        continue;
      }
      movements.push({
        warehouseId: Number(warehouse.id),
        productId: Number(line.product_id),
        colorKey: line.color_key,
        lotKey: lotByLine.get(Number(line.id)) ?? 0,
        quantity,
        unitCost: line.unit_cost === null ? null : Number(line.unit_cost),
        documentLineId: Number(line.id),
      });
    }

    const now = nowUtc();
    await applyMovements({ companyId: Number(document.company_id), documentId: Number(document.id), movements, actorId: user.userId, movementAt: now, transaction });
    await document.update({ status: "posted", posted_at: now, posted_by: user.userId, updated_by: user.userId, updated_at: now }, { transaction });
    return document;
  });
  const [dto] = await toDocumentDtos([document], user, true);
  return dto as DocumentDto;
};

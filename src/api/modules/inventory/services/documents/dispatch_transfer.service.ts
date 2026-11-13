import { AppError } from "../../../../../core/errors/AppError";
import { DataBase } from "../../../../../database";
import { IToken } from "../../../../interfaces/IToken.interface";
import { nowUtc } from "../../../../../utils/dateUtils";
import type { DocumentDto } from "../../types/inventory.types";
import { applyMovements, type MovementInput } from "../shared/stock_engine";
import { getTransitWarehouse } from "../shared/inventory_shared";
import { normalizeDocumentLines, outgoingMovements } from "../shared/document_lines";
import { assertCanOperate, loadDocumentForCaller, toDocumentDtos } from "./document_shared";

// Despachar una transferencia: sale del almacén de origen y entra al almacén
// virtual "En tránsito" de la empresa (mismo lote), hasta que el destino la
// reciba. Despacha quien opera el ORIGEN.
export const dispatchTransferService = async (id: number, user: IToken): Promise<DocumentDto> => {
  const document = await DataBase.instance.sequelize.transaction(async (transaction) => {
    const { document, warehouse, target } = await loadDocumentForCaller(id, user, transaction);
    if (document.doc_type !== "transfer") throw new AppError(400, "Solo se despacha una transferencia");
    if (document.status !== "draft") throw new AppError(409, "La transferencia ya se despachó", undefined, "DOCUMENT_NOT_DRAFT");
    assertCanOperate(user, warehouse, "despachar transferencias");
    if (!warehouse.active || !target?.active) throw new AppError(409, "El almacén de origen o de destino está deshabilitado");

    const companyId = Number(document.company_id);
    const lines = await DataBase.instance.stock_document_line.findAll({ where: { document_id: document.id }, order: [["id", "ASC"]], transaction });
    await normalizeDocumentLines(
      companyId,
      "transfer",
      lines.map((line) => ({ product_id: Number(line.product_id), color: line.color_key, quantity: Number(line.quantity) })),
      transaction
    );
    const transit = await getTransitWarehouse(companyId, user.userId, transaction);
    const movements: MovementInput[] = [];
    for (const line of lines) {
      const out = await outgoingMovements(warehouse, line, Number(line.quantity), transaction);
      movements.push(...out, ...out.map((movement) => ({ ...movement, warehouseId: Number(transit.id), quantity: -movement.quantity, unitCost: null })));
    }

    const now = nowUtc();
    await applyMovements({ companyId, documentId: Number(document.id), movements, actorId: user.userId, movementAt: now, transaction });
    await document.update({ status: "dispatched", posted_at: now, posted_by: user.userId, updated_by: user.userId, updated_at: now }, { transaction });
    return document;
  });
  const [dto] = await toDocumentDtos([document], user, true);
  return dto as DocumentDto;
};

import { AppError } from "../../../../../core/errors/AppError";
import { DataBase } from "../../../../../database";
import { IToken } from "../../../../interfaces/IToken.interface";
import { nowUtc, todayInBusinessTz } from "../../../../../utils/dateUtils";
import type { DocumentDto } from "../../types/inventory.types";
import { REVERSAL_REASON } from "../../types/inventory.types";
import { applyMovements } from "../shared/stock_engine";
import { nextDocumentNumber } from "../shared/inventory_shared";
import { assertCanOperate, documentNumberText, loadDocumentForCaller, toDocumentDtos } from "./document_shared";

// Anular (plan §8.3): un borrador simplemente se anula; un ingreso, salida o
// ajuste confirmado se anula con un documento inverso (otro número, motivo
// "reversal", visible en el kardex) que devuelve cada movimiento. Si el ingreso
// ya se consumió y el almacén no permite negativo, responde INSUFFICIENT_STOCK.
// Una transferencia solo se anula en borrador.
export const cancelDocumentService = async (id: number, reason: string, user: IToken): Promise<DocumentDto> => {
  const result = await DataBase.instance.sequelize.transaction(async (transaction) => {
    const { document, warehouse } = await loadDocumentForCaller(id, user, transaction);
    assertCanOperate(user, warehouse, "anular documentos");
    const now = nowUtc();
    const cancelFields = { status: "cancelled" as const, cancelled_at: now, cancelled_by: user.userId, cancel_reason: reason.trim(), updated_by: user.userId, updated_at: now };

    if (document.status === "draft") {
      await document.update(cancelFields, { transaction });
      return document;
    }
    if (document.status !== "posted" || document.doc_type === "transfer") {
      throw new AppError(409, "Este documento ya no se puede anular", undefined, "DOCUMENT_NOT_CANCELLABLE");
    }

    const companyId = Number(document.company_id);
    const { series, number } = await nextDocumentNumber(companyId, document.doc_type, user.userId, transaction);
    const reversal = await DataBase.instance.stock_document.create(
      {
        ...document.get({ plain: true }),
        id: 0,
        series,
        number,
        status: "posted",
        reason_code: REVERSAL_REASON,
        document_date: todayInBusinessTz(),
        reversal_of_id: document.id,
        notes: `Anula ${documentNumberText(document)}: ${reason.trim()}`.slice(0, 500),
        posted_at: now,
        posted_by: user.userId,
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
    const original = await DataBase.instance.stock_movement.findAll({ where: { document_id: document.id }, transaction });
    await applyMovements({
      companyId,
      documentId: Number(reversal.id),
      movements: original.map((movement) => ({
        warehouseId: Number(movement.warehouse_id),
        productId: Number(movement.product_id),
        colorKey: movement.color_key,
        lotKey: Number(movement.lot_key),
        quantity: -Number(movement.quantity),
        // Devolver una salida reingresa al costo con el que salió.
        unitCost: Number(movement.quantity) < 0 && movement.unit_cost !== null ? Number(movement.unit_cost) : null,
        documentLineId: movement.document_line_id === null ? null : Number(movement.document_line_id),
      })),
      actorId: user.userId,
      movementAt: now,
      transaction,
    });
    await document.update(cancelFields, { transaction });
    return document;
  });
  const [dto] = await toDocumentDtos([result], user, true);
  return dto as DocumentDto;
};

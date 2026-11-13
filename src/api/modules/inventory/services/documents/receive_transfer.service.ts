import { Op } from "sequelize";
import { AppError } from "../../../../../core/errors/AppError";
import { DataBase } from "../../../../../database";
import { IToken } from "../../../../interfaces/IToken.interface";
import { nowUtc } from "../../../../../utils/dateUtils";
import type { DocumentDto, ReceiveLineInput } from "../../types/inventory.types";
import { applyMovements, round3, type MovementInput } from "../shared/stock_engine";
import { getTransitWarehouse } from "../shared/inventory_shared";
import { assertCanOperate, loadDocumentForCaller, toDocumentDtos } from "./document_shared";

// Recibir una transferencia (todo o parte): sale de "En tránsito" y entra al
// destino. Lo que falta queda pendiente (recibida parcial) o, con
// closeDifference, se da por perdido en tránsito y la transferencia se cierra:
// la diferencia queda registrada en el kardex del almacén de tránsito.
// Recibe quien opera el DESTINO.
export const receiveTransferService = async (
  id: number,
  received: ReceiveLineInput[],
  closeDifference: boolean,
  user: IToken
): Promise<DocumentDto> => {
  const document = await DataBase.instance.sequelize.transaction(async (transaction) => {
    const { document, target } = await loadDocumentForCaller(id, user, transaction);
    if (document.doc_type !== "transfer" || !target) throw new AppError(400, "Solo se recibe una transferencia");
    if (document.status !== "dispatched" && document.status !== "partially_received") {
      throw new AppError(409, "La transferencia no está en tránsito", undefined, "TRANSFER_NOT_IN_TRANSIT");
    }
    assertCanOperate(user, target, "recibir transferencias");

    const companyId = Number(document.company_id);
    const transit = await getTransitWarehouse(companyId, user.userId, transaction);
    const lines = await DataBase.instance.stock_document_line.findAll({ where: { document_id: document.id }, order: [["id", "ASC"]], transaction });
    const receivedById = new Map(received.map((entry) => [Number(entry.line_id), round3(Number(entry.quantity))]));
    const unknown = [...receivedById.keys()].find((lineId) => !lines.some((line) => Number(line.id) === lineId));
    if (unknown) throw new AppError(400, "Una de las líneas no es de esta transferencia");

    // Lo que hay en tránsito de cada línea, por lote.
    const inTransit = await DataBase.instance.stock_movement.findAll({
      where: { document_id: document.id, warehouse_id: transit.id, document_line_id: { [Op.in]: lines.map((line) => line.id) } },
      attributes: ["document_line_id", "lot_key", "quantity"],
      transaction,
    });

    const movements: MovementInput[] = [];
    let allDone = true;
    for (const line of lines) {
      const already = Number(line.received_quantity ?? 0);
      const remaining = round3(Number(line.quantity) - already);
      const now = round3(receivedById.get(Number(line.id)) ?? 0);
      if (now < 0 || now > remaining) throw new AppError(400, `No se puede recibir ${now}: quedan ${remaining} en tránsito`);

      // Saldo en tránsito de la línea por lote (lo despachado menos lo ya sacado).
      const byLot = new Map<number, number>();
      for (const movement of inTransit.filter((row) => Number(row.document_line_id) === Number(line.id))) {
        byLot.set(Number(movement.lot_key), round3((byLot.get(Number(movement.lot_key)) ?? 0) + Number(movement.quantity)));
      }
      const take = (quantity: number, toTarget: boolean) => {
        let pending = quantity;
        for (const [lotKey, available] of byLot) {
          if (pending <= 0) break;
          const part = round3(Math.min(pending, available));
          if (part <= 0) continue;
          byLot.set(lotKey, round3(available - part));
          pending = round3(pending - part);
          const base = { productId: Number(line.product_id), colorKey: line.color_key, documentLineId: Number(line.id), unitCost: null };
          movements.push({ ...base, warehouseId: Number(transit.id), lotKey, quantity: -part });
          if (toTarget) movements.push({ ...base, warehouseId: Number(target.id), lotKey: target.track_lots ? lotKey : 0, quantity: part });
        }
      };

      take(now, true);
      const left = round3(remaining - now);
      if (left > 0 && closeDifference) take(left, false);
      if (left > 0 && !closeDifference) allDone = false;
      await line.update({ received_quantity: String(round3(already + now)) }, { transaction });
    }

    const at = nowUtc();
    if (movements.length > 0) {
      await applyMovements({ companyId, documentId: Number(document.id), movements, actorId: user.userId, movementAt: at, transaction });
    }
    await document.update(
      {
        status: allDone ? "received" : "partially_received",
        received_at: at,
        received_by: user.userId,
        notes: closeDifference ? [document.notes, "Diferencia dada por perdida en tránsito"].filter(Boolean).join(" · ").slice(0, 500) : document.notes,
        updated_by: user.userId,
        updated_at: at,
      },
      { transaction }
    );
    return document;
  });
  const [dto] = await toDocumentDtos([document], user, true);
  return dto as DocumentDto;
};

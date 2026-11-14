import { Op } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { isOutOfWriteScope, resolveWriteScope } from "../../../../../core/rbac/writeScope";
import { nowUtc } from "../../../../../utils/dateUtils";
import { IToken } from "../../../../interfaces/IToken.interface";
import { getIgvRate } from "../shared/tax_config";
import { logQuotationEvent } from "../timeline/quotation_event.service";
import { computeQuotationTotal } from "../../model/quotation.model";
import { roundMoney } from "../../../../../utils/numbers";

// Estados cerrados: la cotización ya no se toca.
const CLOSED_STATUSES = ["rejected", "cancelled", "expired", "finished"];

export interface ItemExclusionResult {
  item_id: number;
  is_excluded: boolean;
  subtotal: number;
  total: number;
}

/**
 * Marca un producto de la cotización como "no aceptado" por el cliente, o lo
 * reactiva (pedido del usuario, 14-nov): sin editar la cotización. El equipo
 * lo sigue viendo con su historial; el cliente no (PDF y enlace público) y no
 * suma al total. Reglas, de lo más simple a lo más conservador:
 * - la cotización no puede estar cerrada (rechazada, cancelada, vencida, finalizada);
 * - siempre queda al menos un producto aceptado;
 * - un producto con orden de compra o en una guía de remisión no se desactiva
 *   (primero se resuelve eso: ya hay plata o mercadería de por medio);
 * - el total nunca queda por debajo de lo ya cobrado.
 * Todo en una transacción, con la cotización bloqueada.
 */
export async function setItemExclusionService(itemId: number, excluded: boolean, user: IToken): Promise<ItemExclusionResult> {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const found = await DataBase.instance.quotation_item.findByPk(itemId, { attributes: ["id", "quotation_id"], transaction });
    if (!found) throw new AppError(404, "El producto no existe en la cotización");
    const quotation = await DataBase.instance.quotation.findByPk(found.quotation_id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!quotation || quotation.is_deleted || isOutOfWriteScope(quotation, resolveWriteScope(user))) {
      throw new AppError(404, "El producto no existe en la cotización");
    }
    if (CLOSED_STATUSES.includes(quotation.status)) {
      throw new AppError(409, "La cotización está cerrada: ya no se cambian sus productos", undefined, "QUOTATION_CLOSED");
    }

    const items = await DataBase.instance.quotation_item.findAll({ where: { quotation_id: quotation.id }, transaction, lock: transaction.LOCK.UPDATE });
    const item = items.find((row) => Number(row.id) === itemId);
    if (!item) throw new AppError(404, "El producto no existe en la cotización");
    if (Boolean(item.is_excluded) === excluded) {
      throw new AppError(409, excluded ? "El producto ya está como no aceptado" : "El producto ya está aceptado", undefined, "ITEM_EXCLUSION_UNCHANGED");
    }

    if (excluded) {
      const stillAccepted = items.filter((row) => !row.is_excluded && Number(row.id) !== itemId);
      if (stillAccepted.length === 0) {
        throw new AppError(409, "La cotización tiene que quedar con al menos un producto aceptado", undefined, "LAST_ACCEPTED_ITEM");
      }
      const [purchaseOrderItem, guideLine] = await Promise.all([
        DataBase.instance.purchase_order_item.findOne({ where: { quotation_item_id: itemId }, attributes: ["id"], transaction }),
        DataBase.instance.dispatch_guide_line.findOne({
          where: { quotation_item_id: itemId },
          attributes: ["guide_id"],
          transaction,
        }),
      ]);
      if (purchaseOrderItem) {
        throw new AppError(409, "El producto tiene una orden de compra: resuélvela antes de marcarlo como no aceptado", undefined, "ITEM_HAS_PURCHASE_ORDER");
      }
      const activeGuide = guideLine
        ? await DataBase.instance.dispatch_guide.findOne({ where: { id: guideLine.guide_id, status: { [Op.ne]: "voided" } }, attributes: ["id"], transaction })
        : null;
      if (activeGuide) {
        throw new AppError(409, "El producto está en una guía de remisión: anúlala antes de marcarlo como no aceptado", undefined, "ITEM_HAS_DISPATCH_GUIDE");
      }
    }

    const subtotal = roundMoney(
      items
        .filter((row) => (Number(row.id) === itemId ? !excluded : !row.is_excluded))
        .reduce((sum, row) => sum + Number(row.subtotal), 0)
    );
    const total = roundMoney(computeQuotationTotal(subtotal, Boolean(quotation.includes_igv), await getIgvRate(Number(quotation.company_id))));
    const totalPaid = Number(quotation.total_paid);
    if (totalPaid > total) {
      throw new AppError(
        400,
        `No se puede: el cliente ya pagó S/ ${totalPaid.toFixed(2)} y el nuevo total sería S/ ${total.toFixed(2)}. Corrige los pagos primero.`,
        undefined,
        "TOTAL_BELOW_PAID"
      );
    }

    const now = nowUtc();
    await item.update(
      { is_excluded: excluded, excluded_at: excluded ? now : null, excluded_by: excluded ? user.userId : null, updated_by: user.userId, updated_at: now },
      { transaction }
    );
    const previousTotal = Number(quotation.total);
    await quotation.update({ subtotal, total, updated_by: user.userId, updated_at: now }, { transaction });

    const product = await DataBase.instance.product.findByPk(item.product_id, { attributes: ["name"], transaction });
    const label = `${product?.name ?? "Producto"} × ${item.quantity}`;
    await logQuotationEvent({
      quotationId: Number(quotation.id),
      action: excluded ? "item_excluded" : "item_included",
      description: `${excluded ? "No aceptado" : "Reactivado"}: ${label} (total S/ ${previousTotal.toFixed(2)} → S/ ${total.toFixed(2)})`,
      actorId: user.userId,
      transaction,
    });
    return { item_id: itemId, is_excluded: excluded, subtotal, total };
  });
}

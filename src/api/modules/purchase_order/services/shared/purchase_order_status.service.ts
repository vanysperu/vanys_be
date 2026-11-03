import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { PurchaseOrderItemModel, PurchaseOrderItemStatus } from "../../model/purchase_order_item.model";
import { PurchaseOrderItemPurchaseModel } from "../../model/purchase_order_item_purchase.model";

// Estados cacheados de compras: NUNCA se ponen a mano ni con deltas, se
// recalculan desde la fuente dentro de la transacción del caller (antes este
// cálculo estaba duplicado en el service de crear compra y en el de cambiar
// el estado de un item, y podía divergir).

/** Cantidad comprada de un item: suma de sus compras NO anuladas. */
export async function sumPurchasedQuantity(
  itemId: number,
  transaction: Transaction,
  excludePurchaseId?: number
): Promise<number> {
  const purchases = await DataBase.instance.purchase_order_item_purchase.findAll({
    where: { purchase_order_item_id: itemId, is_deleted: false },
    attributes: ["id", "quantity"],
    transaction,
  });
  return purchases
    .filter((purchase: PurchaseOrderItemPurchaseModel) => purchase.id !== excludePurchaseId)
    .reduce((sum: number, purchase: PurchaseOrderItemPurchaseModel) => sum + Number(purchase.quantity), 0);
}

/**
 * Estado de un item según lo comprado: "purchased" cuando las compras
 * vigentes cubren lo pedido (también si se compró de más, confirmado),
 * "pending" si falta. "not_needed" se respeta: un item marcado así no tiene
 * compras vigentes (assertItemHasNoPurchases), así que no hay nada que
 * recalcular.
 */
export async function recalculateItemStatus(
  itemId: number,
  transaction: Transaction,
  updatedBy?: number,
  // false al REGISTRAR una compra: comprar un item marcado "ya no es
  // necesario" lo vuelve a contar (mismo comportamiento de siempre).
  keepNotNeeded = true
): Promise<PurchaseOrderItemStatus> {
  const item = await DataBase.instance.purchase_order_item.findOne({ where: { id: itemId }, transaction });
  if (!item) throw new Error("El item de la orden de compra no existe");
  if (keepNotNeeded && item.status === "not_needed") return item.status;

  const purchased = await sumPurchasedQuantity(itemId, transaction);
  const status: PurchaseOrderItemStatus = purchased >= item.quantity ? "purchased" : "pending";
  if (status === item.status) return status;

  await DataBase.instance.purchase_order_item.update(
    { status, updated_by: updatedBy ?? null, updated_at: nowUtc() },
    { where: { id: itemId }, transaction }
  );
  return status;
}

// La fecha de "comprada" se fija solo al PASAR a comprada: si ya lo estaba y
// sigue así (ej. se corrigió el monto de una compra), se conserva. Al volver
// a pendiente se limpia.
const resolvePurchasedAt = (
  hasPending: boolean,
  order: { status: string; purchased_at: Date | null } | null
): Date | null => {
  if (hasPending) return null;
  if (order?.status === "purchased" && order.purchased_at !== null) return order.purchased_at;
  return nowUtc();
};

/**
 * El estado de la orden se calcula solo a partir de sus items: mientras
 * quede al menos uno "pending" sigue activa; cuando todos quedan resueltos
 * (comprados o "ya no es necesario"), se cierra.
 */
export async function recalculatePurchaseOrderStatus(
  purchaseOrderId: number,
  transaction: Transaction,
  updatedBy?: number
): Promise<void> {
  const items = await DataBase.instance.purchase_order_item.findAll({
    where: { purchase_order_id: purchaseOrderId },
    attributes: ["id", "status"],
    transaction,
  });
  const hasPending = items.some((item: PurchaseOrderItemModel) => item.status === "pending");
  const status = hasPending ? "pending" : "purchased";

  const order = await DataBase.instance.purchase_order.findOne({
    where: { id: purchaseOrderId },
    attributes: ["id", "status", "purchased_at"],
    transaction,
  });

  const purchasedAt = resolvePurchasedAt(hasPending, order);

  await DataBase.instance.purchase_order.update(
    { status, purchased_at: purchasedAt, updated_by: updatedBy, updated_at: nowUtc() },
    { where: { id: purchaseOrderId }, transaction }
  );
}

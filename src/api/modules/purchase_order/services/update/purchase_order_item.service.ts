import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { PurchaseOrderItemStatus } from "../../model/purchase_order_item.model";
// El estado de la orden de compra NUNCA se pone a mano — se calcula solo a
// partir de sus items (cálculo único compartido con las compras).
import { recalculatePurchaseOrderStatus } from "../shared/purchase_order_status.service";

export class DirectPurchaseNotAllowedError extends Error {}

// Marcar un item como "ya no es necesario" cuando YA tiene compras reales
// registradas dejaba el gasto huérfano: la plata ya salió (y si fue del
// trabajador, ya se le generó una deuda en employee_debt), pero el item
// quedaba como si nunca se hubiera necesitado. La orden entonces se cerraba
// con un costo real que no cuadra contra ningún item pendiente. Si de verdad
// hay que anularlo, primero se anula la compra.
export class ItemHasPurchasesError extends Error {}

const assertItemHasNoPurchases = async (itemId: number): Promise<void> => {
  const purchases = await DataBase.instance.purchase_order_item_purchase.count({
    // Una compra anulada ya no es plata gastada: no bloquea.
    where: { purchase_order_item_id: itemId, is_deleted: false },
  });
  if (purchases > 0) {
    throw new ItemHasPurchasesError(
      "Este item ya tiene compras registradas — anula primero las compras si quieres marcarlo como no necesario."
    );
  }
};

const updatePurchaseOrderItemStatus = async ({
  itemId,
  status,
  updatedBy,
}: {
  itemId: number;
  status: PurchaseOrderItemStatus;
  updatedBy?: number;
}) => {
  // "purchased" solo se alcanza registrando una compra con su monto (ver
  // purchase_order_item_purchase.service.ts) — nunca a mano sin costo,
  // porque entonces no quedaría registrado el gasto real.
  if (status === "purchased") {
    throw new DirectPurchaseNotAllowedError('Para marcar como comprado, registra la compra con su monto.');
  }

  const item = await DataBase.instance.purchase_order_item.findOne({ where: { id: itemId } });
  if (!item) throw new Error("El item de la orden de compra no existe");

  if (status === "not_needed") {
    await assertItemHasNoPurchases(itemId);
  }

  // Escribe en 2 tablas (purchase_order_item, purchase_order) — todo o nada,
  // para que el estado agregado de la orden nunca quede desincronizado de
  // sus items.
  await DataBase.instance.sequelize.transaction(async (transaction) => {
    await DataBase.instance.purchase_order_item.update(
      { status, updated_by: updatedBy, updated_at: nowUtc() },
      { where: { id: itemId }, transaction }
    );

    await recalculatePurchaseOrderStatus(item.purchase_order_id, transaction, updatedBy);
  });

  return DataBase.instance.purchase_order_item.findOne({ where: { id: itemId } });
};

export { updatePurchaseOrderItemStatus };

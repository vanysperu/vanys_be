import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { createQuotationExpense } from "../../../quotation/services/create/quotation_expense.service";
import { PurchaseOrderItemModel } from "../../model/purchase_order_item.model";
import { PurchaseOrderItemPurchaseModel } from "../../model/purchase_order_item_purchase.model";
import { QuotationItemAttributes } from "../../../quotation/model/quotation_item.model";
import { ProductAttributes } from "../../../product/model/product.model";

// Igual que en purchase_order.service.ts: el `include` anidado
// (quotationItem -> product) no está declarado en `PurchaseOrderItemModel`
// por la misma limitación de tipos de Sequelize con asociaciones.
type ItemWithQuotationItem = {
  quotationItem?: (Pick<QuotationItemAttributes, "id"> & { product?: Pick<ProductAttributes, "id" | "name"> | null }) | null;
};

// Se lanza cuando la cantidad de la compra deja el total comprado por
// encima de lo que el item pedía — el controller la mapea a un 400 claro
// en vez de dejar pasar un gasto (y, si aplica, una deuda a un trabajador)
// sin ningún límite.
export class PurchaseExceedsRemainingQuantityError extends Error {}

export interface CreatePurchaseOrderItemPurchaseInput {
  itemId: number;
  quantity: number;
  amount: number;
  notes?: string | null;
  // "company" (por defecto) = flujo normal, nada cambia. "employee" = el
  // trabajador pagó de su bolsillo — paidByUserId es obligatorio en ese
  // caso (quién puso el dinero, no necesariamente quien registra la
  // compra: un admin puede registrarla en nombre de otro trabajador).
  fundingSource?: "company" | "employee";
  paidByUserId?: number;
  createdBy?: number;
}

// El estado de la orden de compra NUNCA se pone a mano — se calcula solo a
// partir de sus items (ver también purchase_order_item.service.ts). Recibe
// la `transaction` del caller (antes se llamaba DESPUÉS del commit, sin
// transacción propia — dos compras de items DISTINTOS de la misma orden
// completándose en paralelo podían pisarse el estado final: CLAUDE.md
// sección 12 exige transacción en toda escritura multi-paso).
const recalculatePurchaseOrderStatus = async (purchaseOrderId: number, transaction: Transaction) => {
  const items = await DataBase.instance.purchase_order_item.findAll({
    where: { purchase_order_id: purchaseOrderId },
    transaction,
  });
  const hasPending = items.some((item: PurchaseOrderItemModel) => item.status === "pending");

  await DataBase.instance.purchase_order.update(
    { status: hasPending ? "pending" : "purchased", purchased_at: hasPending ? null : nowUtc(), updated_at: nowUtc() },
    { where: { id: purchaseOrderId }, transaction }
  );
};

// Un producto de una orden puede conseguirse en varias compras distintas
// (500 lapiceros: 100 acá, 200 allá, 200 más allá) — cada compra registra
// cuánto se consiguió y por cuánto, y SIEMPRE genera un gasto real de la
// cotización (toda compra es un gasto, pedido explícito del usuario). El
// item queda "purchased" recién cuando la suma de sus compras alcanza la
// cantidad pedida; si falta, sigue "pending" con el avance visible.
const createPurchaseOrderItemPurchase = async ({
  itemId,
  quantity,
  amount,
  notes,
  fundingSource = "company",
  paidByUserId,
  createdBy,
}: CreatePurchaseOrderItemPurchaseInput) => {
  const transaction = await DataBase.instance.sequelize.transaction();

  try {
    // `LOCK.UPDATE` (SELECT ... FOR UPDATE) sobre el item: sin esto, dos
    // compras parciales del MISMO item registradas casi al mismo tiempo
    // pueden leer "previousPurchases" cada una sin ver la fila que la otra
    // todavía no comprometió (lost update clásico bajo REPEATABLE READ) —
    // el item queda marcado "pending" para siempre aunque entre las dos
    // compras ya se haya cubierto el 100% de lo pedido, y nadie lo nota
    // hasta que una tercera compra "corrige" el estado sin querer. El lock
    // serializa: la segunda transacción espera a que la primera confirme, y
    // su propio conteo ya ve la compra recién comprometida de la primera.
    const item = await DataBase.instance.purchase_order_item.findOne({
      where: { id: itemId },
      include: [{ association: "quotationItem", include: [{ association: "product", attributes: ["id", "name"] }] }],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!item) throw new Error("El item de la orden de compra no existe");

    // Mismo motivo, sobre la orden: dos items DISTINTOS de la misma orden
    // completándose en paralelo no deben pisarse el `recalculatePurchaseOrderStatus`
    // final (ver abajo, ahora dentro de esta misma transacción).
    const purchaseOrder = await DataBase.instance.purchase_order.findOne({
      where: { id: item.purchase_order_id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!purchaseOrder) throw new Error("La orden de compra no existe");

    // Tope: no se puede registrar más de lo que falta. Sin este chequeo se
    // podía generar un gasto (y, si era plata del trabajador, una deuda)
    // sin límite — ej. un item pide 10, ya hay 8 compradas, y alguien
    // registra "compré 500 más" por error de tipeo, inflando el gasto real
    // de la cotización sin ningún control.
    const previousPurchasesBefore = await DataBase.instance.purchase_order_item_purchase.findAll({
      where: { purchase_order_item_id: itemId },
      transaction,
    });
    const totalPurchasedBefore = previousPurchasesBefore.reduce(
      (sum: number, row: PurchaseOrderItemPurchaseModel) => sum + row.quantity,
      0
    );
    const remaining = item.quantity - totalPurchasedBefore;
    if (quantity > remaining) {
      throw new PurchaseExceedsRemainingQuantityError(
        remaining > 0
          ? `Solo faltan ${remaining} unidades por comprar de este producto`
          : "Este producto ya está completamente comprado"
      );
    }

    const productName = (item as unknown as ItemWithQuotationItem).quotationItem?.product?.name ?? "producto";
    const expense = await createQuotationExpense({
      quotationId: purchaseOrder.quotation_id,
      input: {
        description: notes
          ? `Compra: ${productName} x${quantity} — ${notes}`
          : `Compra: ${productName} x${quantity}`,
        amount,
        category: "compra",
        spent_at: nowUtc().toISOString().slice(0, 10),
      },
      createdBy,
      // MUY IMPORTANTE: sin esto, el gasto (y su evento del timeline) se
      // guardaban sueltos, fuera de esta transacción — si algo fallaba
      // después (ej. una columna demasiado corta), el gasto ya quedaba
      // guardado para siempre aunque el resto de la operación se revirtiera.
      // Así fue como quedaron gastos "fantasma" en una prueba anterior.
      transaction,
    });

    const purchase = await DataBase.instance.purchase_order_item_purchase.create(
      {
        id: 0,
        purchase_order_item_id: itemId,
        quotation_expense_id: expense.id,
        quantity,
        amount,
        funding_source: fundingSource,
        paid_by_user_id: fundingSource === "employee" ? paidByUserId ?? null : null,
        created_by: createdBy ?? null,
        created_at: nowUtc(),
        updated_by: null,
        updated_at: null,
      },
      { transaction }
    );

    // Plata del trabajador: la empresa le queda debiendo ese monto — una
    // fila de employee_debt por compra, nunca se acumula a mano (se agrega
    // por GROUP BY al listar "a quién se le debe", ver employee_debt
    // find.service.ts).
    if (fundingSource === "employee") {
      await DataBase.instance.employee_debt.create(
        {
          id: 0,
          company_id: purchaseOrder.company_id,
          user_id: paidByUserId!,
          purchase_order_item_purchase_id: purchase.id,
          amount,
          status: "pending",
          paid_at: null,
          created_by: createdBy ?? null,
          created_at: nowUtc(),
          updated_by: null,
          updated_at: null,
        },
        { transaction }
      );
    }

    // Cantidad total ya comprada (compras previas + esta) vs. lo pedido —
    // solo se marca "purchased" cuando ya no falta nada. Ya sabemos el total
    // exacto (totalPurchasedBefore + quantity, validado arriba contra el
    // tope) sin volver a consultar la tabla.
    const totalPurchased = totalPurchasedBefore + quantity;
    const isComplete = totalPurchased >= item.quantity;

    await DataBase.instance.purchase_order_item.update(
      { status: isComplete ? "purchased" : "pending", updated_by: createdBy, updated_at: nowUtc() },
      { where: { id: itemId }, transaction }
    );

    await recalculatePurchaseOrderStatus(item.purchase_order_id, transaction);

    await transaction.commit();

    return purchase;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export { createPurchaseOrderItemPurchase };

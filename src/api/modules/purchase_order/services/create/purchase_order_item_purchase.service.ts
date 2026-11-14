import { createPurchaseEntry } from "../../../inventory/services/integrations/purchase_entry";
import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc, todayInBusinessTz } from "../../../../../utils/dateUtils";
import { createQuotationExpense } from "../../../quotation/services/create/quotation_expense.service";
import {
  recalculateItemStatus,
  recalculatePurchaseOrderStatus,
  sumPurchasedQuantity,
} from "../shared/purchase_order_status.service";
import { buildPurchaseExpenseDescription, notesToSuffix } from "../shared/purchase_expense_description";
import { QuotationItemAttributes } from "../../../quotation/model/quotation_item.model";
import { ProductAttributes } from "../../../product/model/product.model";
import { resolvePaymentAccountId } from "../../../variable_general/services/shared/payment_account.service";
import { linkPurchaseToInvoice, registerInvoice } from "../../../invoice/services/shared/register_invoice";
import { assertQuotationIsActive } from "../../../quotation/services/shared/active_quotation";

// Igual que en purchase_order.service.ts: el `include` anidado
// (quotationItem -> product) no está declarado en `PurchaseOrderItemModel`
// por la misma limitación de tipos de Sequelize con asociaciones.
type ItemWithQuotationItem = {
  quotationItem?: (Pick<QuotationItemAttributes, "id"> & { product?: Pick<ProductAttributes, "id" | "name"> | null }) | null;
};

// Se lanza cuando la compra deja el total comprado por encima de lo que el
// item pedía y NO se confirmó la compra adicional. El frontend la usa para
// preguntar "la cantidad a comprar era X, ¿seguro quieres comprar más?" — si
// la persona confirma, reenvía con allowExceed (pedido explícito del
// usuario: comprar de más es válido, pero tiene que ser a propósito, nunca
// por un error de tipeo que pase desapercibido).
export class PurchaseExceedsRemainingQuantityError extends Error {
  constructor(
    message: string,
    public readonly ordered: number,
    public readonly alreadyPurchased: number,
    public readonly requested: number
  ) {
    super(message);
  }
}

export interface CreatePurchaseOrderItemPurchaseInput {
  itemId: number;
  quantity: number;
  amount: number;
  notes?: string | null;
  // true = la persona ya confirmó que quiere comprar por encima de lo pedido.
  allowExceed?: boolean;
  // "company" (por defecto) = flujo normal, nada cambia. "employee" = el
  // trabajador pagó de su bolsillo — paidByUserId es obligatorio en ese
  // caso (quién puso el dinero, no necesariamente quien registra la
  // compra: un admin puede registrarla en nombre de otro trabajador).
  fundingSource?: "company" | "employee";
  paidByUserId?: number;
  // Cuenta de la empresa desde la que se pagó (vacío = efectivo). Solo aplica
  // a "company": con plata del trabajador, la empresa no paga nada todavía.
  paymentAccountId?: unknown;
  // N.° de operación (opcional), también solo de "company".
  operationNumber?: string | null;
  // ¿La compra llevaba factura? (pedido explícito del usuario). Si es así,
  // queda registrada la factura; su archivo se sube aparte (o queda en
  // "Faltan subir").
  hasInvoice?: boolean;
  // Con hasInvoice: factura de compra YA registrada a la que se suma esta
  // compra (una factura puede cubrir varios productos). Sin esto, se crea una nueva.
  invoiceId?: number;
  // Sin factura todavía, pero llega después (Sprint 2, ítem 3): la compra
  // queda "pending" en la bandeja "Compras sin factura".
  invoicePending?: boolean;
  // Inventario (Sprint 2, ítem 2): almacén al que ingresa lo comprado. El
  // controller ya validó que el usuario opera ese almacén.
  warehouseId?: number;
  // Con almacén de lotes: lote (opcional) y vencimiento (perecibles).
  lotCode?: string | null;
  expiryDate?: string | null;
  createdBy?: number;
}

// Factura de una compra: la suma a una ya registrada (misma empresa y tienda)
// o registra una nueva. Devuelve el id de la factura.
async function invoiceForPurchase({
  existingInvoiceId,
  purchaseId,
  companyId,
  quotationId,
  description,
  actorId,
  transaction,
}: {
  existingInvoiceId: number | undefined;
  purchaseId: number;
  companyId: number;
  quotationId: number;
  description: string;
  actorId: number | null;
  transaction: Transaction;
}): Promise<number> {
  const quotation = await DataBase.instance.quotation.findByPk(quotationId, { attributes: ["business_unit_id"], transaction });
  const storeId = quotation?.business_unit_id;
  const businessUnitId = storeId === null || storeId === undefined ? null : Number(storeId);
  if (!existingInvoiceId) {
    return registerInvoice({ companyId, businessUnitId, type: "purchase", quotationId, purchaseId, description, actorId, transaction });
  }
  await linkPurchaseToInvoice({ invoiceId: existingInvoiceId, purchaseId, companyId, businessUnitId, actorId, transaction });
  return existingInvoiceId;
}

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
  allowExceed = false,
  fundingSource = "company",
  paidByUserId,
  paymentAccountId,
  operationNumber,
  hasInvoice = false,
  invoiceId: existingInvoiceId,
  invoicePending = false,
  warehouseId,
  lotCode,
  expiryDate,
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
    await assertQuotationIsActive(purchaseOrder.quotation_id, "registrar una compra", transaction);

    // La cuenta tiene que ser de la empresa DUEÑA de la orden y estar activa.
    // Con plata del trabajador queda sin cuenta: el egreso de la empresa es la
    // reposición, que registra su propia cuenta (Deudas a personal).
    const expenseAccountId =
      fundingSource === "company"
        ? await resolvePaymentAccountId({
            accountId: paymentAccountId,
            companyId: purchaseOrder.company_id,
            required: false,
            transaction,
          })
        : null;

    // Comprar por encima de lo que falta exige confirmación explícita
    // (allowExceed). Sin confirmar, se rechaza: un "compré 500" en vez de
    // "50" por error de tipeo inflaría el gasto real de la cotización (y, si
    // era plata del trabajador, su deuda) sin que nadie lo note.
    // Solo compras vigentes: una anulada ya no cuenta como comprada.
    const totalPurchasedBefore = await sumPurchasedQuantity(itemId, transaction);
    const remaining = Math.max(item.quantity - totalPurchasedBefore, 0);
    const exceeds = quantity > remaining;
    if (exceeds && !allowExceed) {
      throw new PurchaseExceedsRemainingQuantityError(
        remaining > 0
          ? `La cantidad a comprar era ${item.quantity} y ya se compraron ${totalPurchasedBefore}: solo faltan ${remaining}.`
          : `La cantidad a comprar era ${item.quantity} y ya está completa.`,
        item.quantity,
        totalPurchasedBefore,
        quantity
      );
    }

    // Día calendario de Lima: el MISMO para el gasto y la deuda (invariante
    // incurred_at = spent_at).
    const spentAt = todayInBusinessTz();
    const productName = (item as unknown as ItemWithQuotationItem).quotationItem?.product?.name ?? "producto";
    // Una compra adicional confirmada queda marcada en el gasto, para que
    // quien revise los gastos de la cotización entienda por qué se compró
    // más de lo pedido.
    const extraQuantity = exceeds ? quantity - remaining : 0;
    const expense = await createQuotationExpense({
      quotationId: purchaseOrder.quotation_id,
      input: {
        description: buildPurchaseExpenseDescription(productName, quantity, extraQuantity, notesToSuffix(notes)),
        amount,
        category: "compra",
        // Día calendario de Lima: antes era el día UTC, así que una compra
        // registrada después de las 7 p. m. quedaba con fecha de mañana.
        spent_at: spentAt,
        payment_account_id: expenseAccountId,
        operation_number: fundingSource === "company" ? operationNumber : null,
      },
      createdBy,
      // Plata del trabajador: no mueve la caja de la empresa (gancho de
      // cierre de caja, ver core/money/cashPeriod.ts).
      movesCash: fundingSource === "company",
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
        // Con factura pasa a "linked" al vincularla (abajo, misma transacción).
        invoice_status: invoicePending ? "pending" : "not_required",
        is_deleted: false,
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
          origin: "purchase",
          purchase_order_item_purchase_id: purchase.id,
          quotation_expense_id: null,
          description: null,
          category: null,
          // La tienda la da la cotización de la orden.
          business_unit_id: null,
          // Invariante: la deuda nace el mismo día que el gasto de la compra.
          incurred_at: spentAt,
          amount,
          paid_amount: 0,
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

    // La factura de la compra, en la misma transacción: si la compra falla,
    // no queda una factura suelta. Con existingInvoiceId la compra se suma a
    // una factura ya registrada (una factura puede cubrir varios productos);
    // sin él, se registra una factura nueva.
    const invoiceId = hasInvoice
      ? await invoiceForPurchase({
          existingInvoiceId,
          purchaseId: Number(purchase.id),
          companyId: Number(purchaseOrder.company_id),
          quotationId: Number(purchaseOrder.quotation_id),
          description: `${productName} × ${quantity}`,
          actorId: createdBy ?? null,
          transaction,
        })
      : null;

    // Cantidad vigente comprada (compras previas + esta) vs. lo pedido — solo
    // queda "purchased" cuando ya no falta nada (también si se compró de más,
    // confirmado). Mismo cálculo que corregir/anular una compra.
    if (warehouseId) {
      const quotationItem = (item as unknown as { quotationItem?: { color?: string | null; product?: { id: number; name: string } } }).quotationItem;
      if (!quotationItem?.product) throw new Error("El producto de la orden de compra no existe");
      await createPurchaseEntry({
        companyId: Number(purchaseOrder.company_id),
        warehouseId,
        productId: Number(quotationItem.product.id),
        color: quotationItem.color ?? null,
        quantity,
        amount,
        note: `Compra de la orden #${item.purchase_order_id}: ${quotationItem.product.name} × ${quantity}`,
        lotCode: lotCode ?? null,
        expiryDate: expiryDate ?? null,
        actorId: createdBy ?? null,
        transaction,
      });
    }

    await recalculateItemStatus(itemId, transaction, createdBy, false);
    await recalculatePurchaseOrderStatus(item.purchase_order_id, transaction, createdBy);

    await transaction.commit();

    return { ...purchase.get({ plain: true }), invoice_id: invoiceId };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export { createPurchaseOrderItemPurchase };

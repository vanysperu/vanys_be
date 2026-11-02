import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { isOutOfWriteScope, WriteScope } from "../../../../../core/rbac/writeScope";
import { formatSoles } from "../../../../../core/utils/money";
import { EmployeeDebtModel } from "../../../employee_debt/model/employee_debt.model";
import { QuotationExpenseModel } from "../../../quotation/model/quotation_expense.model";
import { PurchaseOrderModel } from "../../model/purchase_order.model";
import { PurchaseOrderItemModel } from "../../model/purchase_order_item.model";
import { PurchaseOrderItemPurchaseModel } from "../../model/purchase_order_item_purchase.model";

export interface LockedPurchase {
  item: PurchaseOrderItemModel;
  purchaseOrder: PurchaseOrderModel;
  // Empresa/tienda de la compra = las de la cotización de la orden.
  businessUnitId: number | null;
  purchase: PurchaseOrderItemPurchaseModel;
  expense: QuotationExpenseModel;
  // Deuda con el trabajador de esta compra (vigente o anulada); null si
  // nunca se pagó con plata de un trabajador.
  debt: EmployeeDebtModel | null;
  productName: string;
}

const notFound = () => new AppError(404, "La compra no existe");

/**
 * Bloquea (FOR UPDATE) todo lo que toca corregir o anular una compra, SIEMPRE
 * en el mismo orden — item → orden → compra → gasto → deuda — igual que al
 * registrar una compra (item → orden), para que dos operaciones simultáneas
 * sobre el mismo item nunca se bloqueen en cruz. Ningún camino bloquea una
 * reposición después de una deuda (por eso bajar una compra por debajo de lo
 * ya repuesto se bloquea, en vez de reacomodar la reposición).
 *
 * Fuera del alcance de ESCRITURA → 404. La excepción del "asignado puede
 * tocar el item" NO aplica a corregir/anular (es solo para registrar compras).
 */
export async function lockPurchaseForWrite(
  purchaseId: number,
  scope: WriteScope,
  transaction: Transaction
): Promise<LockedPurchase> {
  // Lectura previa sin lock solo para saber qué item bloquear primero (el
  // item de una compra nunca cambia).
  const target = await DataBase.instance.purchase_order_item_purchase.findOne({
    where: { id: purchaseId },
    attributes: ["id", "purchase_order_item_id"],
    transaction,
  });
  if (!target) throw notFound();

  const lock = transaction.LOCK.UPDATE;
  const item = await DataBase.instance.purchase_order_item.findOne({
    where: { id: target.purchase_order_item_id },
    transaction,
    lock,
  });
  if (!item) throw notFound();
  const purchaseOrder = await DataBase.instance.purchase_order.findOne({
    where: { id: item.purchase_order_id },
    transaction,
    lock,
  });
  if (!purchaseOrder) throw notFound();

  const quotation = await DataBase.instance.quotation.findOne({
    where: { id: purchaseOrder.quotation_id },
    attributes: ["id", "company_id", "business_unit_id"],
    transaction,
  });
  if (!quotation) throw notFound();
  const owner = { company_id: purchaseOrder.company_id, business_unit_id: quotation.business_unit_id };
  if (isOutOfWriteScope(owner, scope)) throw notFound();

  const purchase = await DataBase.instance.purchase_order_item_purchase.findOne({
    where: { id: purchaseId },
    transaction,
    lock,
  });
  if (!purchase) throw notFound();
  const expense = await DataBase.instance.quotation_expense.findOne({
    where: { id: purchase.quotation_expense_id },
    transaction,
    lock,
  });
  if (!expense) throw notFound();
  const debt = await DataBase.instance.employee_debt.findOne({
    where: { purchase_order_item_purchase_id: purchaseId },
    transaction,
    lock,
  });

  const quotationItem = await DataBase.instance.quotation_item.findOne({
    where: { id: item.quotation_item_id },
    attributes: ["id", "product_id"],
    transaction,
  });
  const product = quotationItem
    ? await DataBase.instance.product.findOne({ where: { id: quotationItem.product_id }, attributes: ["id", "name"], transaction })
    : null;

  return {
    item,
    purchaseOrder,
    businessUnitId: quotation.business_unit_id,
    purchase,
    expense,
    debt,
    productName: product?.name ?? "producto",
  };
}

// Una deuda anulada no es deuda: para las reglas solo cuenta la vigente.
export const liveDebtOf = (debt: EmployeeDebtModel | null): EmployeeDebtModel | null =>
  debt && debt.status !== "cancelled" ? debt : null;

export const userDisplayName = async (userId: number | null, transaction: Transaction): Promise<string | null> => {
  if (userId === null) return null;
  const user = await DataBase.instance.user.findOne({
    where: { id: userId },
    attributes: ["id", "name", "paternal_lastname"],
    transaction,
  });
  return user ? `${user.name} ${user.paternal_lastname ?? ""}`.trim() : null;
};

// Ya se le repuso algo al trabajador por esta compra: no se puede quitarle la
// deuda (pasar a plata de la empresa, cambiar de trabajador, anular) sin
// deshacer primero esa reposición.
export const debtReimbursedError = async (debt: EmployeeDebtModel, transaction: Transaction): Promise<AppError> => {
  const name = (await userDisplayName(debt.user_id, transaction)) ?? "el trabajador";
  return new AppError(
    409,
    `Ya se le repuso ${formatSoles(debt.paid_amount)} de esta compra a ${name}. Anula primero esa reposición.`,
    { paid_amount: Number(debt.paid_amount) },
    "PURCHASE_DEBT_REIMBURSED"
  );
};

export const purchaseAnnulledError = () =>
  new AppError(409, "Esta compra está anulada: no se puede corregir ni volver a anular", undefined, "PURCHASE_ANNULLED");

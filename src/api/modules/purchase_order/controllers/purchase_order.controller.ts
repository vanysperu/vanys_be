import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { AppError } from "../../../../core/errors/AppError";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { createPurchaseOrder, TenantMismatchError } from "../services/create/purchase_order.service";
import {
  createPurchaseOrderItemPurchase,
  PurchaseExceedsRemainingQuantityError,
} from "../services/create/purchase_order_item_purchase.service";
import { getPurchaseOrderById, getPurchaseOrdersList } from "../services/find/purchase_order.service";
import {
  DirectPurchaseNotAllowedError,
  ItemHasPurchasesError,
  updatePurchaseOrderItemStatus,
} from "../services/update/purchase_order_item.service";
import { DataBase } from "../../../../database";
import { parsePaginationParams } from "../../../../core/validators/pagination.validator";
import { resolveBusinessUnitFilter } from "../../../../core/rbac/businessUnitScope";

// La orden de compra no tiene columna propia de tienda: hereda la de su
// cotización (quotation_id), así que se resuelve con un lookup puntual en
// vez de tipar la asociación "quotation" sobre PurchaseOrderModel.
const belongsToBusinessUnit = async (quotationId: number, businessUnitId: number): Promise<boolean> => {
  const quotation = await DataBase.instance.quotation.findOne({
    where: { id: quotationId },
    attributes: ["business_unit_id"],
  });
  return quotation?.business_unit_id === businessUnitId;
};

export const createPurchaseOrderController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;

  if (!user.isSystem && Number(req.body.company_id) !== user.companyId) {
    throw new AppError(403, "No puedes crear órdenes de compra para otra empresa");
  }

  try {
    const purchaseOrder = await createPurchaseOrder({
      input: req.body,
      createdBy: user.userId,
      callerBusinessUnitId: resolveBusinessUnitFilter(user),
    });
    return ok(res, 201, purchaseOrder, "Orden de compra creada correctamente");
  } catch (err: unknown) {
    if (err instanceof TenantMismatchError) {
      throw new AppError(403, err.message);
    }
    throw err;
  }
});

export const listPurchaseOrdersController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { isSystem, companyId, userId } = user;
  const { status, assignedToMe, quotationId, clientName, assigneeName, assignedTo: assignedToParam, dateFrom, dateTo } = req.query;
  const { page, limit, orderBy, orderDir } = parsePaginationParams(req.query);

  // "assignedToMe=1": cualquier usuario ve SUS propias órdenes sin
  // necesitar el módulo completo de compras — es lo que alimenta el
  // widget del Inicio, no requiere ser admin.
  // "assignedTo=<id>": filtro por persona desde la lista (selector de
  // trabajador); "assignedToMe" tiene prioridad.
  const assignedTo = assignedToMe ? userId : Number(assignedToParam) > 0 ? Number(assignedToParam) : undefined;

  // Filtro por columna de la tabla (cliente/asignado a) resuelto ahora
  // directo en la query (WHERE real), ya no en memoria sobre la página
  // traída — así `meta.total` refleja el conteo real filtrado.
  const resp = await getPurchaseOrdersList({
    companyId: isSystem ? null : companyId,
    businessUnitId: resolveBusinessUnitFilter(user),
    assignedTo,
    status: (status as string) || undefined,
    clientName: (clientName as string) || undefined,
    assigneeName: (assigneeName as string) || undefined,
    quotationId: quotationId ? Number(quotationId) : undefined,
    dateFrom,
    dateTo,
    page,
    limit,
    orderBy,
    orderDir,
  });

  const message = resp.data.length === 0 ? "No se encontraron órdenes de compra" : "Lista obtenida correctamente";
  ok(res, 200, resp, message);
});

export const getPurchaseOrderController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { id } = req.params;

  const purchaseOrder = await getPurchaseOrderById(Number(id));
  if (!purchaseOrder) throw new AppError(404, "No encontrada");

  if (!user.isSystem && purchaseOrder.company_id !== user.companyId) {
    throw new AppError(403, "No tienes acceso a esta orden de compra");
  }

  const scopedBusinessUnitId = resolveBusinessUnitFilter(user);
  if (scopedBusinessUnitId !== undefined && !(await belongsToBusinessUnit(purchaseOrder.quotation_id, scopedBusinessUnitId))) {
    throw new AppError(403, "No tienes acceso a esta orden de compra");
  }

  ok(res, 200, purchaseOrder, "Encontrada");
});

// Solo el propio asignado (o un admin de la empresa) puede tocar los items
// de la orden — nadie más puede cerrar/marcar/comprar algo que no le toca.
// Lanza AppError si no tiene acceso; nunca responde nada por su cuenta.
const assertCanTouchPurchaseOrderItem = async (itemId: number, user: IToken) => {
  const item = await DataBase.instance.purchase_order_item.findOne({ where: { id: itemId } });
  if (!item) {
    throw new AppError(404, "El item no existe");
  }

  const purchaseOrder = await DataBase.instance.purchase_order.findOne({
    where: { id: item.purchase_order_id },
  });
  if (!purchaseOrder) {
    throw new AppError(404, "La orden de compra no existe");
  }

  const isAssignee = purchaseOrder.assigned_to === user.userId;
  const isCompanyAdmin = !user.isSystem && purchaseOrder.company_id === user.companyId;
  if (!user.isSystem && !isAssignee && !isCompanyAdmin) {
    throw new AppError(403, "No tienes acceso a esta orden de compra");
  }

  // Un admin de empresa limitado a su tienda no puede tocar items de
  // órdenes de otra tienda (el propio asignado siempre puede, sin importar
  // tienda: es su tarea personal, ver comentario del check anterior).
  const scopedBusinessUnitId = resolveBusinessUnitFilter(user);
  if (!isAssignee && scopedBusinessUnitId !== undefined && !(await belongsToBusinessUnit(purchaseOrder.quotation_id, scopedBusinessUnitId))) {
    throw new AppError(403, "No tienes acceso a esta orden de compra");
  }

  return item;
};

export const updatePurchaseOrderItemStatusController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { itemId } = req.params;
  const { status } = req.body;

  await assertCanTouchPurchaseOrderItem(Number(itemId), user);

  try {
    const result = await updatePurchaseOrderItemStatus({ itemId: Number(itemId), status, updatedBy: user.userId });
    ok(res, 200, result, "Estado actualizado correctamente");
  } catch (err: unknown) {
    if (err instanceof DirectPurchaseNotAllowedError || err instanceof ItemHasPurchasesError) {
      throw new AppError(400, err.message);
    }
    throw err;
  }
});

export const createPurchaseOrderItemPurchaseController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { itemId } = req.params;
  const { quantity, amount, notes, funding_source, paid_by_user_id, allow_exceed } = req.body;

  await assertCanTouchPurchaseOrderItem(Number(itemId), user);

  // Plata propia del trabajador: por defecto es quien registra la compra,
  // salvo que un admin la registre explícitamente en nombre de otro
  // (paid_by_user_id), validado por createPurchaseOrderItemPurchaseValidator
  // para que pertenezca a la misma empresa.
  const paidByUserId = funding_source === "employee" ? Number(paid_by_user_id ?? user.userId) : undefined;

  let purchase;
  try {
    purchase = await createPurchaseOrderItemPurchase({
      itemId: Number(itemId),
      quantity,
      amount,
      notes,
      allowExceed: allow_exceed === true,
      fundingSource: funding_source,
      paidByUserId,
      createdBy: user.userId,
    });
  } catch (err: unknown) {
    // 409 con código estable y las cantidades: el frontend muestra la
    // confirmación "¿seguro quieres comprar más?" y, si se acepta, reenvía
    // la misma compra con allow_exceed: true.
    if (err instanceof PurchaseExceedsRemainingQuantityError) {
      throw new AppError(
        409,
        err.message,
        { ordered: err.ordered, already_purchased: err.alreadyPurchased, requested: err.requested },
        "PURCHASE_EXCEEDS_REMAINING"
      );
    }
    throw err;
  }

  ok(res, 201, purchase, "Compra registrada correctamente");
});

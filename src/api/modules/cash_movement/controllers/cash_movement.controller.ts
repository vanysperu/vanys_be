import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { AppError } from "../../../../core/errors/AppError";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { createCashMovement } from "../services/create/cash_movement.service";
import { getCashMovementById, getCashMovementsList } from "../services/find/cash_movement.service";
import { disableOrEnableCashMovementById } from "../services/delete/cash_movement.service";
import { resolveBusinessUnitFilter, resolveTargetBusinessUnitId } from "../../../../core/rbac/businessUnitScope";
import { DataBase } from "../../../../database";

export const createCashMovementController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { direction, category, amount, description, occurred_at, quotation_id, purchase_order_id } = req.body;

  // Mismo criterio que clientes/cotizaciones/usuarios (CLAUDE.md sección 10
  // + 11.1): la empresa nunca se confía del body, y si el caller está
  // limitado a una tienda propia, el movimiento se crea SIEMPRE ahí.
  const companyId = user.companyId!;
  const business_unit_id = await resolveTargetBusinessUnitId(user, req.body.business_unit_id);

  if (quotation_id) {
    const quotation = await DataBase.instance.quotation.findOne({ where: { id: quotation_id } });
    if (!quotation || (quotation.company_id !== companyId && !user.isSystem)) {
      throw new AppError(403, "La cotización seleccionada no pertenece a esta empresa");
    }
  }
  if (purchase_order_id) {
    const purchaseOrder = await DataBase.instance.purchase_order.findOne({ where: { id: purchase_order_id } });
    if (!purchaseOrder || (purchaseOrder.company_id !== companyId && !user.isSystem)) {
      throw new AppError(403, "La orden de compra seleccionada no pertenece a esta empresa");
    }
  }

  const movement = await createCashMovement({
    movement: {
      company_id: companyId,
      business_unit_id,
      direction,
      category,
      amount,
      description: description ?? null,
      occurred_at,
      quotation_id: quotation_id ?? null,
      purchase_order_id: purchase_order_id ?? null,
    },
    createdBy: user.userId,
  });

  ok(res, 201, movement, "Movimiento registrado correctamente");
});

export const listCashMovementsController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { direction, category, quotationId, purchaseOrderId, dateFrom, dateTo } = req.query;
  const page = Number(req.query.page) || 1;
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  const resp = await getCashMovementsList({
    companyId: user.isSystem ? null : user.companyId,
    businessUnitId: resolveBusinessUnitFilter(user),
    direction: (direction as "income" | "expense") || undefined,
    category: (category as string) || undefined,
    quotationId: quotationId ? Number(quotationId) : undefined,
    purchaseOrderId: purchaseOrderId ? Number(purchaseOrderId) : undefined,
    dateFrom: (dateFrom as string) || undefined,
    dateTo: (dateTo as string) || undefined,
    page,
    limit,
  });

  const message = resp.data.length === 0 ? "No se encontraron movimientos" : "Lista de movimientos obtenida correctamente";
  ok(res, 200, resp, message);
});

export const disableCashMovementController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { id } = req.params;

  const movement = await getCashMovementById(Number(id));
  if (!movement) throw new AppError(404, "El movimiento no existe");
  if (!user.isSystem && movement.company_id !== user.companyId) {
    throw new AppError(403, "No tienes acceso a este movimiento");
  }
  const scopedBusinessUnitId = resolveBusinessUnitFilter(user);
  if (scopedBusinessUnitId !== undefined && movement.business_unit_id !== scopedBusinessUnitId) {
    throw new AppError(403, "No tienes acceso a este movimiento");
  }

  const result = await disableOrEnableCashMovementById({ movementId: Number(id), updatedBy: user.userId });

  ok(res, 200, result, "Proceso exitoso");
});

import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { AppError } from "../../../../core/errors/AppError";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { createCashMovement } from "../services/create/cash_movement.service";
import {
  CASH_MOVEMENT_SOURCES,
  getCashMovementById,
  getCashMovementsList,
} from "../services/find/cash_movement.service";
import { disableOrEnableCashMovementById } from "../services/delete/cash_movement.service";
import { correctCashMovementById } from "../services/update/cash_movement.service";
import { getCashMovementCorrections } from "../services/find/cash_movement_correction.service";
import { resolveBusinessUnitFilter, resolveTargetBusinessUnitId } from "../../../../core/rbac/businessUnitScope";
import { resolveWriteScope, WriteScope } from "../../../../core/rbac/writeScope";
import { MoneyCorrectionSource, MONEY_CORRECTION_SOURCES } from "../../money_correction/types/money_correction.types";
import { DataBase } from "../../../../database";
import { resolvePaymentAccountId } from "../../variable_general/services/shared/payment_account.service";
import { toNullableText } from "../../money_correction/services/shared/correction_diff";
import { resolveListCompanyFilter, resolveTargetCompanyId } from "../../../../core/rbac/companyScope";
import { toggleReasonOf } from "../validators/adjustment_reason.validator";

export const createCashMovementController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { direction, category, amount, description, occurred_at, quotation_id, purchase_order_id, operation_number } = req.body;

  // Mismo criterio que clientes/cotizaciones/usuarios (CLAUDE.md sección 10
  // + 11.1): un usuario de empresa crea SIEMPRE en la suya (y en su tienda
  // si está limitado a una); el Super Administrador elige la empresa en el
  // formulario (antes se usaba `user.companyId`, null para él, y el
  // movimiento fallaba al guardarse).
  const writeScope = resolveWriteScope(user);
  const companyId = await resolveTargetCompanyId(user, req.body.company_id, "movimientos");
  // Alcance de ESCRITURA: un gestor con tienda propia crea SOLO en su tienda
  // aunque tenga "ver todas las tiendas" (ese permiso es de lectura) — antes
  // ese permiso le dejaba mandar la tienda que quisiera en el body.
  const business_unit_id =
    writeScope.businessUnitId ?? (await resolveTargetBusinessUnitId(user, req.body.business_unit_id, companyId));

  if (quotation_id) {
    const quotation = await DataBase.instance.quotation.findOne({ where: { id: quotation_id } });
    if (!quotation || quotation.company_id !== companyId) {
      throw new AppError(403, "La cotización seleccionada no pertenece a esta empresa");
    }
  }
  if (purchase_order_id) {
    const purchaseOrder = await DataBase.instance.purchase_order.findOne({ where: { id: purchase_order_id } });
    if (!purchaseOrder || purchaseOrder.company_id !== companyId) {
      throw new AppError(403, "La orden de compra seleccionada no pertenece a esta empresa");
    }
  }

  // Desde/hacia qué cuenta se movió el dinero (pedido explícito del usuario);
  // vacío = efectivo. No es obligatoria: un ingreso/egreso de caja chica es
  // efectivo por naturaleza.
  const payment_account_id = await resolvePaymentAccountId({
    accountId: req.body.payment_account_id,
    companyId,
    required: false,
  });

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
      payment_account_id,
      operation_number: toNullableText(operation_number),
    },
    createdBy: user.userId,
  });

  ok(res, 201, movement, "Movimiento registrado correctamente");
});

export const listCashMovementsController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { direction, category, quotationId, purchaseOrderId, dateFrom, dateTo, source, paymentAccountId } = req.query;
  const page = Number(req.query.page) || 1;
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  const resp = await getCashMovementsList({
    // El Super Administrador puede acotar a una empresa (?companyId): sin eso,
    // sus totales mezclan la plata de todas.
    companyId: resolveListCompanyFilter(user, req.query.companyId),
    businessUnitId: resolveBusinessUnitFilter(user),
    direction: direction === "income" || direction === "expense" ? direction : undefined,
    category: (category as string) || undefined,
    source: CASH_MOVEMENT_SOURCES.find((value) => value === source),
    paymentAccountId:
      paymentAccountId === "cash" ? "cash" : Number(paymentAccountId) > 0 ? Number(paymentAccountId) : undefined,
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

  // La empresa/tienda del movimiento se valida dentro del service con la fila
  // bloqueada (alcance de escritura): fuera de alcance = 404.
  const result = await disableOrEnableCashMovementById({
    movementId: Number(req.params.id),
    scope: resolveWriteScope(user),
    updatedBy: user.userId,
    // Motivo opcional: solo se exige si el movimiento es de un mes cerrado
    // (se registra como ajuste).
    reason: toggleReasonOf(req.body?.reason),
  });

  ok(res, 200, result, "Proceso exitoso");
});

// Corrige un movimiento MANUAL (este endpoint solo conoce la tabla
// cash_movement: un pago, gasto, deuda o reposición se corrige en su propio
// módulo). Lista blanca explícita de campos: nunca `req.body` entero.
export const updateCashMovementController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { amount, category, occurred_at, payment_account_id, operation_number, description, quotation_id, purchase_order_id, reason } =
    req.body;

  const result = await correctCashMovementById({
    movementId: Number(req.params.id),
    input: { amount, category, occurred_at, payment_account_id, operation_number, description, quotation_id, purchase_order_id, reason },
    scope: resolveWriteScope(user),
    updatedBy: user.userId,
  });

  ok(res, 200, result, "Movimiento corregido correctamente");
});

// Fuente de la fila de Caja cuyo historial se pide (?source=). Sin ella, un
// movimiento manual (compatibilidad con la ruta original).
const sourceOf = (value: unknown): MoneyCorrectionSource =>
  MONEY_CORRECTION_SOURCES.find((source) => source === value) ?? "manual";

// Alcance de LECTURA del historial: misma empresa que el usuario y, si está
// limitado a una tienda, la que su permiso de lectura permita (un gestor con
// "ver todas las tiendas" lee el historial de toda su empresa).
const readScopeOf = (user: IToken): WriteScope => ({
  companyId: resolveWriteScope(user).companyId,
  businessUnitId: resolveBusinessUnitFilter(user),
});

export const listCashMovementCorrectionsController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const page = Number(req.query.page) || 1;
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  const resp = await getCashMovementCorrections({
    source: sourceOf(req.query.source),
    sourceId: Number(req.params.sourceId),
    scope: readScopeOf(user),
    page,
    limit,
  });

  const message = resp.data.length === 0 ? "Esta fila no tiene correcciones" : "Historial de correcciones obtenido correctamente";
  ok(res, 200, resp, message);
});

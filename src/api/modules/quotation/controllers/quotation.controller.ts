import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { AppError } from "../../../../core/errors/AppError";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import {
  createQuotation,
  CustomizationMismatchError,
  DisabledCatalogEntityError,
  MissingProductPriceError,
  MissingQuantityError,
  TenantMismatchError,
} from "../services/create/quotation.service";
import {
  AdvanceOnlyOnAcceptError,
  changeQuotationStatus,
  InvalidTransitionError,
  QuotationHasMoneyInvolvedError,
  updateQuotationById,
} from "../services/update/quotation.service";
import { changeItemStage } from "../services/update/quotation_item.service";
import {
  createQuotationPayment,
  CreateQuotationPaymentInput,
  PaymentExceedsBalanceError,
} from "../services/create/quotation_payment.service";
import { hasRouteAccess } from "../../../../middlewares/user-access";
import { createQuotationExpense } from "../services/create/quotation_expense.service";
import { getQuotationById, getQuotationsList } from "../services/find/quotation.service";
import { generateQuotationPdf } from "../services/pdf/quotation_pdf.service";
import { QuotationStatus } from "../model/quotation.model";
import { DataBase } from "../../../../database";
import { parsePaginationParams } from "../../../../core/validators/pagination.validator";
import { resolveBusinessUnitFilter } from "../../../../core/rbac/businessUnitScope";

export const createQuotationController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;

  if (!user.isSystem && Number(req.body.company_id) !== user.companyId) {
    throw new AppError(403, "No puedes crear cotizaciones para otra empresa");
  }

  // Regla de oro de tiendas: igual que en clientes, si el usuario está
  // limitado a una tienda propia, la cotización se crea SIEMPRE en esa
  // tienda, sin importar lo que mande el body.
  const scopedBusinessUnitId = resolveBusinessUnitFilter(user);
  const input = {
    ...req.body,
    business_unit_id: scopedBusinessUnitId ?? req.body.business_unit_id ?? null,
  };

  try {
    const quotation = await createQuotation({ input, createdBy: user.userId });
    return ok(res, 201, quotation, "Cotización creada correctamente");
  } catch (err: unknown) {
    if (err instanceof TenantMismatchError) {
      throw new AppError(403, err.message);
    }
    if (
      err instanceof MissingProductPriceError ||
      err instanceof MissingQuantityError ||
      err instanceof DisabledCatalogEntityError ||
      err instanceof CustomizationMismatchError
    ) {
      throw new AppError(400, err.message);
    }
    throw err;
  }
});

export const listQuotationsController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { isSystem, companyId } = user;
  const queryParams = req.query;
  const { page, limit, orderBy, orderDir } = parsePaginationParams(queryParams);
  const status = (queryParams.status as string) || undefined;
  const clientId = queryParams.clientId ? Number(queryParams.clientId) : undefined;
  const createdBy = Number(queryParams.createdBy) > 0 ? Number(queryParams.createdBy) : undefined;

  // Tienda: si el caller está limitado a una, manda esa (nunca la del query).
  // Si no, puede filtrar por cualquiera — el filtro de empresa sigue
  // aplicando, así que una tienda ajena simplemente no trae resultados.
  const scopedBusinessUnitId = resolveBusinessUnitFilter(user);
  const requestedBusinessUnitId = Number(queryParams.businessUnitId) > 0 ? Number(queryParams.businessUnitId) : undefined;

  const resp = await getQuotationsList({
    page,
    limit,
    orderBy,
    orderDir,
    companyId: isSystem ? null : companyId,
    businessUnitId: scopedBusinessUnitId ?? requestedBusinessUnitId,
    status,
    clientId,
    createdBy,
    dateFrom: queryParams.dateFrom,
    dateTo: queryParams.dateTo,
  });
  const message = resp.data.length === 0 ? "No se encontraron cotizaciones" : "Lista de cotizaciones obtenida correctamente";

  ok(res, 200, resp, message);
});

export const getQuotationController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { id } = req.params;

  if (!(await assertQuotationBelongsToCaller(Number(id), user))) {
    throw new AppError(403, "No tienes acceso a esta cotización");
  }

  const quotation = await getQuotationById(Number(id));

  ok(res, 200, quotation, "Cotización obtenida correctamente");
});

export const updateQuotationController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { id } = req.params;

  if (!(await assertQuotationBelongsToCaller(Number(id), user))) {
    throw new AppError(403, "No tienes acceso a esta cotización");
  }

  const result = await updateQuotationById({ quotation: req.body, quotationId: Number(id), updatedBy: user.userId });

  ok(res, 200, result, "Cotización actualizada correctamente");
});

export const changeQuotationStatusController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { id } = req.params;
  const { status, advance_payment: advancePayment } = req.body as {
    status: QuotationStatus;
    advance_payment?: CreateQuotationPaymentInput | null;
  };

  if (!(await assertQuotationBelongsToCaller(Number(id), user))) {
    throw new AppError(403, "No tienes acceso a esta cotización");
  }

  // Registrar el adelanto es registrar un pago: exige el mismo permiso que
  // POST /quotation/:id/payments, no solo el de cambiar estado.
  if (advancePayment && !hasRouteAccess(user, `/quotation/${id}/payments`, "POST")) {
    throw new AppError(403, "No tienes permiso para registrar pagos");
  }

  try {
    const result = await changeQuotationStatus({
      quotationId: Number(id),
      nextStatus: status,
      updatedBy: user.userId,
      advancePayment: advancePayment ?? undefined,
    });
    const message = advancePayment ? "Cotización aceptada y adelanto registrado" : "Estado actualizado correctamente";
    ok(res, 200, result, message);
  } catch (err: unknown) {
    if (
      err instanceof InvalidTransitionError ||
      err instanceof QuotationHasMoneyInvolvedError ||
      err instanceof AdvanceOnlyOnAcceptError ||
      err instanceof PaymentExceedsBalanceError
    ) {
      throw new AppError(400, err.message);
    }
    throw err;
  }
});

export const changeItemStageController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { itemId } = req.params;
  const { stage_id } = req.body as { stage_id: number };

  const item = await DataBase.instance.quotation_item.findOne({ where: { id: Number(itemId) } });
  if (!item) throw new AppError(404, "El item no existe");

  if (!(await assertQuotationBelongsToCaller(item.quotation_id, user))) {
    throw new AppError(403, "No tienes acceso a esta cotización");
  }

  try {
    const result = await changeItemStage({ itemId: Number(itemId), nextStageId: stage_id, updatedBy: user.userId });
    ok(res, 200, result, "Etapa actualizada correctamente");
  } catch (err: unknown) {
    if (err instanceof InvalidTransitionError) {
      throw new AppError(400, err.message);
    }
    throw err;
  }
});

export const createQuotationPaymentController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { id } = req.params;

  if (!(await assertQuotationBelongsToCaller(Number(id), user))) {
    throw new AppError(403, "No tienes acceso a esta cotización");
  }

  let payment;
  try {
    payment = await createQuotationPayment({ quotationId: Number(id), input: req.body, createdBy: user.userId });
  } catch (err: unknown) {
    if (err instanceof PaymentExceedsBalanceError) throw new AppError(400, err.message);
    throw err;
  }

  ok(res, 201, payment, "Pago registrado correctamente");
});

export const createQuotationExpenseController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { id } = req.params;

  if (!(await assertQuotationBelongsToCaller(Number(id), user))) {
    throw new AppError(403, "No tienes acceso a esta cotización");
  }

  const expense = await createQuotationExpense({ quotationId: Number(id), input: req.body, createdBy: user.userId });

  ok(res, 201, expense, "Gasto registrado correctamente");
});

export const downloadQuotationPdfController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { id } = req.params;

  if (!(await assertQuotationBelongsToCaller(Number(id), user))) {
    throw new AppError(403, "No tienes acceso a esta cotización");
  }

  const buffer = await generateQuotationPdf(Number(id));

  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="cotizacion-${String(id).padStart(4, "0")}.pdf"`,
    "Content-Length": buffer.length,
  });
  res.send(buffer);
});

export const assertQuotationBelongsToCaller = async (quotationId: number, user: IToken): Promise<boolean> => {
  if (user.isSystem) return true;

  const quotation = await DataBase.instance.quotation.findOne({ where: { id: quotationId } });
  if (!quotation) return false;
  if (quotation.company_id !== user.companyId) return false;

  const scopedBusinessUnitId = resolveBusinessUnitFilter(user);
  if (scopedBusinessUnitId === undefined) return true;

  return quotation.business_unit_id === scopedBusinessUnitId;
};

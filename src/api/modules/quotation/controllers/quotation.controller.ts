import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { resolveListCompanyFilter } from "../../../../core/rbac/companyScope";
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
  TotalBelowPaidError,
  updateQuotationById,
} from "../services/update/quotation.service";
import { changeItemStage } from "../services/update/quotation_item.service";
import { createQuotationPayment, CreateQuotationPaymentInput } from "../services/create/quotation_payment.service";
import { QuotationNotActiveError } from "../services/shared/active_quotation";
import { hasRouteAccess } from "../../../../middlewares/user-access";
import { createQuotationExpense } from "../services/create/quotation_expense.service";
import { getQuotationDetailById, getQuotationsList } from "../services/find/quotation.service";
import { findQuotationExpenseById } from "../services/find/quotation_expense.service";
import { listQuotationExpenseCorrections } from "../services/find/quotation_expense_correction.service";
import { correctQuotationExpense } from "../services/update/quotation_expense.service";
import { toggleQuotationExpense } from "../services/disable/quotation_expense.service";
import { toggleReasonOf } from "../../cash_movement/validators/adjustment_reason.validator";
import { assertQuotationWritable, isOutOfReadScope } from "../services/shared/quotation_scope";
import { resolveWriteScope } from "../../../../core/rbac/writeScope";
import { generateQuotationPdf } from "../services/pdf/quotation_pdf.service";
import { QuotationStatus } from "../model/quotation.model";
import { DataBase } from "../../../../database";
import { resolvePaymentAccountId } from "../../variable_general/services/shared/payment_account.service";
import { parsePaginationParams } from "../../../../core/validators/pagination.validator";
import { resolveBusinessUnitFilter } from "../../../../core/rbac/businessUnitScope";

// Mismo 409 para todo lo que exige una cotización aceptada (pagos, gastos,
// compras y producción), así el frontend lo reconoce por un solo `code`.
const notActiveError = (err: QuotationNotActiveError) =>
  new AppError(409, err.message, undefined, "QUOTATION_NOT_ACTIVE");

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
    companyId: resolveListCompanyFilter(req.user as IToken, req.query.companyId),
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

  const quotation = await getQuotationDetailById(Number(id));

  ok(res, 200, quotation, "Cotización obtenida correctamente");
});

export const updateQuotationController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { id } = req.params;

  if (!(await assertQuotationBelongsToCaller(Number(id), user))) {
    throw new AppError(403, "No tienes acceso a esta cotización");
  }

  try {
    const result = await updateQuotationById({ quotation: req.body, quotationId: Number(id), updatedBy: user.userId });
    ok(res, 200, result, "Cotización actualizada correctamente");
  } catch (err: unknown) {
    if (err instanceof TotalBelowPaidError) throw new AppError(400, err.message);
    throw err;
  }
});

export const changeQuotationStatusController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { id } = req.params;
  const { status, advance_payment: advancePayment, invoice_issued: invoiceIssued } = req.body as {
    status: QuotationStatus;
    advance_payment?: CreateQuotationPaymentInput | null;
    // Al pasar a Finalizada: ¿emitimos factura?
    invoice_issued?: boolean;
  };

  if (!(await assertQuotationBelongsToCaller(Number(id), user))) {
    throw new AppError(403, "No tienes acceso a esta cotización");
  }

  // Registrar el adelanto es registrar un pago: exige el mismo permiso que
  // POST /quotation/:id/payments, no solo el de cambiar estado.
  if (advancePayment && !hasRouteAccess(user, `/quotation/${id}/payments`, "POST")) {
    throw new AppError(403, "No tienes permiso para registrar pagos");
  }
  // ...y el mismo alcance de escritura: solo en cotizaciones de su tienda.
  if (advancePayment) await assertQuotationWritable(Number(id), user, "registrar pagos");

  try {
    const result = await changeQuotationStatus({
      quotationId: Number(id),
      nextStatus: status,
      updatedBy: user.userId,
      advancePayment: advancePayment ?? undefined,
      invoiceIssued: invoiceIssued === true,
    });
    const message = advancePayment ? "Cotización aceptada y adelanto registrado" : "Estado actualizado correctamente";
    ok(res, 200, result, message);
  } catch (err: unknown) {
    if (
      err instanceof InvalidTransitionError ||
      err instanceof QuotationHasMoneyInvolvedError ||
      err instanceof AdvanceOnlyOnAcceptError
    ) {
      // Un adelanto por encima del total ya llega como AppError 400 con
      // código PAYMENT_EXCEEDS_BALANCE (quotation_payment.service.ts): no se
      // re-envuelve, para no perder el código.
      throw new AppError(400, err.message);
    }
    if (err instanceof QuotationNotActiveError) throw notActiveError(err);
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
    if (err instanceof QuotationNotActiveError) throw notActiveError(err);
    throw err;
  }
});

export const createQuotationPaymentController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { id } = req.params;

  // Alcance de ESCRITURA (decisión 4): "ver todas las tiendas" no habilita
  // registrar pagos en otra tienda.
  await assertQuotationWritable(Number(id), user, "registrar pagos");

  let payment;
  try {
    payment = await createQuotationPayment({ quotationId: Number(id), input: req.body, createdBy: user.userId });
  } catch (err: unknown) {
    // PAYMENT_EXCEEDS_BALANCE ya es un AppError con su código: pasa tal cual.
    if (err instanceof QuotationNotActiveError) throw notActiveError(err);
    throw err;
  }

  ok(res, 201, payment, "Pago registrado correctamente");
});

export const createQuotationExpenseController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { id } = req.params;

  await assertQuotationWritable(Number(id), user, "registrar gastos");

  // La cuenta (vacío = efectivo) tiene que ser de la empresa DUEÑA de la
  // cotización y estar activa.
  const quotation = await DataBase.instance.quotation.findOne({ where: { id: Number(id) }, attributes: ["company_id"] });
  if (!quotation) throw new AppError(404, "La cotización no existe");
  const paymentAccountId = await resolvePaymentAccountId({
    accountId: req.body.payment_account_id,
    companyId: quotation.company_id,
    required: false,
  });

  const { description, amount, category, spent_at, operation_number, funding_source, paid_by_user_id } = req.body;
  try {
    const expense = await createQuotationExpense({
      quotationId: Number(id),
      input: { description, amount, category, spent_at, payment_account_id: paymentAccountId, operation_number, funding_source, paid_by_user_id },
      createdBy: user.userId,
    });
    ok(res, 201, expense, "Gasto registrado correctamente");
  } catch (err: unknown) {
    if (err instanceof QuotationNotActiveError) throw notActiveError(err);
    throw err;
  }
});

// GET /quotation/expense/find/:id — el diálogo de corrección carga el gasto
// actual. Es lectura: alcance de lectura; fuera de él, 404.
export const findQuotationExpenseController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const expense = await findQuotationExpenseById(Number(req.params.id));
  if (!expense || isOutOfReadScope(expense, user)) throw new AppError(404, "El gasto no existe");

  ok(res, 200, expense, "Gasto obtenido correctamente");
});

// PUT /quotation/expense/update/:id — corrige un gasto manual.
export const correctQuotationExpenseController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { amount, description, category, spent_at, funding_source, paid_by_user_id, payment_account_id, operation_number, reason } = req.body;

  const result = await correctQuotationExpense({
    expenseId: Number(req.params.id),
    input: { amount, description, category, spent_at, funding_source, paid_by_user_id, payment_account_id, operation_number, reason },
    scope: resolveWriteScope(user),
    updatedBy: user.userId,
  });

  ok(res, 200, result, "Gasto corregido correctamente");
});

// PUT /quotation/expense/disable/:id — anula o restaura un gasto manual.
export const toggleQuotationExpenseController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const result = await toggleQuotationExpense({
    expenseId: Number(req.params.id),
    scope: resolveWriteScope(user),
    updatedBy: user.userId,
    // Motivo opcional: obligatorio solo si el gasto es de un mes cerrado.
    reason: toggleReasonOf(req.body?.reason),
  });

  ok(res, 200, result, result.is_deleted ? "Gasto anulado correctamente" : "Gasto restaurado correctamente");
});

// GET /quotation/expense/:id/corrections?page=&limit=
export const listQuotationExpenseCorrectionsController = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = parsePaginationParams(req.query);
  const result = await listQuotationExpenseCorrections({
    expenseId: Number(req.params.id),
    user: req.user as IToken,
    page,
    limit,
  });

  ok(res, 200, result, "Historial de correcciones obtenido correctamente");
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

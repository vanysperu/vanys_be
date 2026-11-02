import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { AppError } from "../../../../core/errors/AppError";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { getPaymentsList, PaymentStatusFilter } from "../services/find/payment.service";

const PAYMENT_STATUS_FILTERS: PaymentStatusFilter[] = ["active", "disabled", "all"];
import { updatePaymentById } from "../services/update/payment.service";
import { disableOrEnablePaymentById } from "../services/delete/payment.service";
import { resolveBusinessUnitFilter } from "../../../../core/rbac/businessUnitScope";
import { resolveWriteScope, WriteScope } from "../../../../core/rbac/writeScope";
import { getPaymentById } from "../services/find/payment_detail.service";
import { getPaymentCorrections } from "../services/find/payment_correction.service";
import { QuotationNotActiveError } from "../../quotation/services/shared/active_quotation";
import { toggleReasonOf } from "../../cash_movement/validators/adjustment_reason.validator";

// Mismo criterio que cash_movement.controller.ts: la empresa/tienda nunca
// se confía del query/body, siempre sale del token (CLAUDE.md sección 10/11.1).
export const listPaymentsController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { quotationId, method, dateFrom, dateTo, includeDisabled, status, paymentAccountId, clientName } = req.query;
  const page = Number(req.query.page) || 1;
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  // `includeDisabled=true` se mantiene por compatibilidad: equivale a "all".
  const requestedStatus = PAYMENT_STATUS_FILTERS.find((value) => value === status);
  const statusFilter: PaymentStatusFilter = requestedStatus ?? (includeDisabled === "true" ? "all" : "active");

  const accountFilter =
    paymentAccountId === "cash" ? "cash" : Number(paymentAccountId) > 0 ? Number(paymentAccountId) : undefined;

  const resp = await getPaymentsList({
    companyId: user.isSystem ? null : user.companyId,
    businessUnitId: resolveBusinessUnitFilter(user),
    quotationId: quotationId ? Number(quotationId) : undefined,
    method: (method as string) || undefined,
    paymentAccountId: accountFilter,
    clientName: typeof clientName === "string" && clientName.trim() ? clientName.trim() : undefined,
    dateFrom: (dateFrom as string) || undefined,
    dateTo: (dateTo as string) || undefined,
    status: statusFilter,
    page,
    limit,
  });

  const message = resp.data.length === 0 ? "No se encontraron pagos" : "Lista de pagos obtenida correctamente";
  ok(res, 200, resp, message);
});

// Alcance de LECTURA (find e historial): misma empresa y, si el usuario está
// limitado a una tienda, la que su permiso de lectura permita.
const readScopeOf = (user: IToken): WriteScope => ({
  companyId: resolveWriteScope(user).companyId,
  businessUnitId: resolveBusinessUnitFilter(user),
});

// La cotización inactiva responde 409 con código estable; el sobre-pago ya es
// un AppError (PAYMENT_EXCEEDS_BALANCE) y lo responde el errorHandler solo.
const rethrowQuotationNotActive = (err: unknown): never => {
  if (err instanceof QuotationNotActiveError) throw new AppError(409, err.message, undefined, "QUOTATION_NOT_ACTIVE");
  throw err;
};

export const findPaymentController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const payment = await getPaymentById({ paymentId: Number(req.params.id), scope: readScopeOf(user) });
  ok(res, 200, payment, "Pago obtenido correctamente");
});

// Corrige un pago. El alcance de ESCRITURA (empresa y tienda propia, sin
// importar "ver todas las tiendas") y la existencia se validan en el service
// con la fila bloqueada. Lista blanca de campos: nunca `req.body` entero.
export const updatePaymentController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { amount, method, paid_at, notes, operation_number, payment_account_id, reason } = req.body;

  const payment = await updatePaymentById({
    paymentId: Number(req.params.id),
    input: { amount, method, paid_at, notes, operation_number, payment_account_id, reason },
    scope: resolveWriteScope(user),
    updatedBy: user.userId,
  }).catch(rethrowQuotationNotActive);

  ok(res, 200, payment, "Pago corregido correctamente");
});

export const disablePaymentController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;

  // Solo al restaurar el pago puede exceder el saldo (el sobre-pago es un
  // AppError que responde el errorHandler).
  const result = await disableOrEnablePaymentById({
    paymentId: Number(req.params.id),
    scope: resolveWriteScope(user),
    updatedBy: user.userId,
    // Motivo opcional: obligatorio solo si el pago es de un mes cerrado.
    reason: toggleReasonOf(req.body?.reason),
  }).catch(rethrowQuotationNotActive);

  ok(res, 200, result, "Proceso exitoso");
});

export const listPaymentCorrectionsController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const page = Number(req.query.page) || 1;
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  const resp = await getPaymentCorrections({
    paymentId: Number(req.params.id),
    scope: readScopeOf(user),
    page,
    limit,
  });

  const message = resp.data.length === 0 ? "Este pago no tiene correcciones" : "Historial de correcciones obtenido correctamente";
  ok(res, 200, resp, message);
});

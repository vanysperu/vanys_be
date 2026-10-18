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
import { DataBase } from "../../../../database";
import { assertQuotationBelongsToCaller } from "../../quotation/controllers/quotation.controller";
import { PaymentExceedsBalanceError } from "../../quotation/services/create/quotation_payment.service";

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

const assertPaymentBelongsToCaller = async (paymentId: number, user: IToken) => {
  const payment = await DataBase.instance.quotation_payment.findOne({ where: { id: paymentId } });
  if (!payment) throw new AppError(404, "El pago no existe");
  if (!(await assertQuotationBelongsToCaller(payment.quotation_id, user))) {
    throw new AppError(403, "No tienes acceso a este pago");
  }
  return payment;
};

export const updatePaymentController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { id } = req.params;

  await assertPaymentBelongsToCaller(Number(id), user);

  let payment;
  try {
    payment = await updatePaymentById({ paymentId: Number(id), input: req.body, updatedBy: user.userId });
  } catch (err: unknown) {
    if (err instanceof PaymentExceedsBalanceError) throw new AppError(400, err.message);
    throw err;
  }

  ok(res, 200, payment, "Pago actualizado correctamente");
});

export const disablePaymentController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { id } = req.params;

  await assertPaymentBelongsToCaller(Number(id), user);

  const result = await disableOrEnablePaymentById({ paymentId: Number(id), updatedBy: user.userId });

  ok(res, 200, result, "Proceso exitoso");
});

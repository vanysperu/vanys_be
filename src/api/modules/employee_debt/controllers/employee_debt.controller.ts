import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { AppError } from "../../../../core/errors/AppError";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import {
  EmployeeDebtStatusFilter,
  getEmployeeDebtSummary,
} from "../services/find/employee_debt.service";
import { getEmployeeDebtPayments } from "../services/find/employee_debt_payment.service";
import { InvalidPaymentAmountError, registerEmployeeDebtPayment } from "../services/update/employee_debt.service";
import {
  EmployeeDebtPaymentAlreadyVoidedError,
  EmployeeDebtPaymentNotFoundError,
  voidEmployeeDebtPayment,
} from "../services/disable/employee_debt_payment.service";
import { DataBase } from "../../../../database";
import { resolveTargetCompanyId } from "../../../../core/rbac/companyScope";
import { resolveTargetBusinessUnitId } from "../../../../core/rbac/businessUnitScope";
import { DuplicateManualDebtError, createManualEmployeeDebt } from "../services/create/employee_debt.service";
import {
  EmployeeDebtNotCancellableError,
  EmployeeDebtNotFoundError,
  cancelManualEmployeeDebt,
} from "../services/disable/employee_debt.service";
import { EmployeeDebtDetailStatusFilter, getEmployeeDebtDetail } from "../services/find/employee_debt_detail.service";
import { resolvePaymentAccountId } from "../../variable_general/services/shared/payment_account.service";
import { toNullableText } from "../../money_correction/services/shared/correction_diff";
import { resolveWriteScope } from "../../../../core/rbac/writeScope";
import { toggleReasonOf } from "../../cash_movement/validators/adjustment_reason.validator";
import { assertExpenseCategory } from "../services/shared/expense_category.service";
import { findEmployeeDebtById } from "../services/find/employee_debt_by_id.service";
import { findEmployeeDebtPaymentById } from "../services/find/employee_debt_payment_by_id.service";
import { getEmployeeDebtCorrections } from "../services/find/employee_debt_correction.service";
import { getEmployeeDebtPaymentCorrections } from "../services/find/employee_debt_payment_correction.service";
import { correctManualEmployeeDebt } from "../services/update/employee_debt_correction.service";
import { correctEmployeeDebtPayment } from "../services/update/employee_debt_payment.service";

const STATUS_FILTERS: EmployeeDebtStatusFilter[] = ["pending", "paid", "all"];

const NO_RESULTS_MESSAGE: Record<EmployeeDebtStatusFilter, string> = {
  pending: "No hay deudas pendientes con el personal",
  paid: "Todavía no se repuso ninguna deuda",
  all: "No hay deudas registradas con el personal",
};

const parsePage = (query: Request["query"]) => ({
  page: Number(query.page) || 1,
  limit: Math.min(Number(query.limit) || 20, 100),
});

export const listEmployeeDebtsController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  // Por defecto "pending" (pedido explícito del usuario).
  const status = STATUS_FILTERS.find((value) => value === req.query.status) ?? "pending";
  const userId = Number(req.query.userId) > 0 ? Number(req.query.userId) : undefined;

  const resp = await getEmployeeDebtSummary({
    companyId: user.isSystem ? null : user.companyId,
    status,
    userId,
    dateFrom: (req.query.dateFrom as string) || undefined,
    dateTo: (req.query.dateTo as string) || undefined,
    ...parsePage(req.query),
  });

  const message = resp.data.length === 0 ? NO_RESULTS_MESSAGE[status] : "Lista de deudas obtenida correctamente";
  ok(res, 200, resp, message);
});

export const payEmployeeDebtController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { userId } = req.params;

  // Alcance de ESCRITURA (no el de lectura): un usuario ligado a una tienda
  // solo repone deudas de su tienda (el service reparte solo entre ellas).
  const scope = resolveWriteScope(user);

  const employee = await DataBase.instance.user.findOne({ where: { id: Number(userId) } });
  if (!employee) throw new AppError(404, "El trabajador no existe");
  if (scope.companyId !== null && employee.company_id !== scope.companyId) {
    throw new AppError(403, "Este trabajador no pertenece a tu empresa");
  }
  const employeeCompanyId = employee.company_id;
  if (employeeCompanyId === null || employeeCompanyId === undefined) {
    throw new AppError(400, "El trabajador no pertenece a ninguna empresa");
  }

  // Desde qué cuenta se le repuso (vacío = efectivo); siempre de la empresa
  // del trabajador, y activa.
  const paymentAccountId = await resolvePaymentAccountId({
    accountId: req.body?.payment_account_id,
    companyId: employeeCompanyId,
    required: false,
  });

  try {
    const result = await registerEmployeeDebtPayment({
      userId: Number(userId),
      companyId: employeeCompanyId,
      amount: Number(req.body.amount),
      paymentAccountId,
      operationNumber: toNullableText(req.body?.operation_number),
      scope,
      createdBy: user.userId,
    });
    ok(res, 200, result, result.fully_paid ? "Deuda saldada correctamente" : "Abono registrado correctamente");
  } catch (err: unknown) {
    if (err instanceof InvalidPaymentAmountError) throw new AppError(400, err.message);
    throw err;
  }
});

export const listEmployeeDebtPaymentsController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const userId = Number(req.query.userId) > 0 ? Number(req.query.userId) : undefined;

  const resp = await getEmployeeDebtPayments({
    companyId: user.isSystem ? null : user.companyId,
    userId,
    ...parsePage(req.query),
  });

  const message = resp.data.length === 0 ? "No hay reposiciones registradas" : "Reposiciones obtenidas correctamente";
  ok(res, 200, resp, message);
});

export const voidEmployeeDebtPaymentController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;

  try {
    const result = await voidEmployeeDebtPayment({
      paymentId: Number(req.params.id),
      scope: resolveWriteScope(user),
      voidedBy: user.userId,
      // Motivo opcional: obligatorio solo si la reposición es de un mes cerrado.
      reason: toggleReasonOf(req.body?.reason),
    });
    ok(res, 200, result, "Reposición anulada: sus compras vuelven a quedar pendientes de reponer");
  } catch (err: unknown) {
    if (err instanceof EmployeeDebtPaymentNotFoundError) throw new AppError(404, err.message);
    if (err instanceof EmployeeDebtPaymentAlreadyVoidedError) throw new AppError(409, err.message, undefined, "ALREADY_VOIDED");
    throw err;
  }
});

const DETAIL_STATUS_FILTERS: EmployeeDebtDetailStatusFilter[] = ["pending", "paid", "cancelled", "all"];

export const getEmployeeDebtDetailController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const status = DETAIL_STATUS_FILTERS.find((value) => value === req.query.status) ?? "all";

  const resp = await getEmployeeDebtDetail({
    companyId: user.isSystem ? null : user.companyId,
    userId: Number(req.query.userId),
    status,
    ...parsePage(req.query),
  });

  const message = resp.data.length === 0 ? "Este trabajador no tiene deudas registradas" : "Deudas obtenidas correctamente";
  ok(res, 200, resp, message);
});

export const createManualEmployeeDebtController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { user_id, description, category, amount, incurred_at } = req.body;
  // Alcance de ESCRITURA: un usuario ligado a una tienda registra deudas
  // solo en SU tienda, aunque tenga "ver todas las tiendas".
  const scope = resolveWriteScope(user);

  // Empresa: la propia; el Super Administrador elige (company_id del body).
  const companyId = await resolveTargetCompanyId(user, req.body.company_id, "deudas");

  // Solo un trabajador ACTIVO de esa misma empresa.
  const employee = await DataBase.instance.user.findOne({ where: { id: Number(user_id) } });
  if (!employee || employee.company_id !== companyId) {
    throw new AppError(400, "El trabajador seleccionado no pertenece a esta empresa");
  }
  if (employee.is_deleted || !employee.status) throw new AppError(400, "El trabajador seleccionado está deshabilitado");

  await assertExpenseCategory(String(category), companyId);
  const businessUnitId =
    scope.businessUnitId ?? (await resolveTargetBusinessUnitId(user, req.body.business_unit_id, companyId));

  try {
    const debt = await createManualEmployeeDebt({
      companyId,
      businessUnitId,
      userId: employee.id,
      description: String(description).trim(),
      category: String(category),
      amount: Number(amount),
      incurredAt: String(incurred_at),
      createdBy: user.userId,
    });
    ok(res, 201, debt, "Deuda registrada: la empresa le debe este monto al trabajador");
  } catch (err: unknown) {
    if (err instanceof DuplicateManualDebtError) throw new AppError(409, err.message, undefined, "DUPLICATE_DEBT");
    throw err;
  }
});

export const cancelManualEmployeeDebtController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;

  try {
    const result = await cancelManualEmployeeDebt({
      debtId: Number(req.params.id),
      scope: resolveWriteScope(user),
      cancelledBy: user.userId,
    });
    ok(res, 200, result, "Deuda anulada");
  } catch (err: unknown) {
    if (err instanceof EmployeeDebtNotFoundError) throw new AppError(404, err.message);
    if (err instanceof EmployeeDebtNotCancellableError) throw new AppError(409, err.message, undefined, "DEBT_NOT_CANCELLABLE");
    throw err;
  }
});

// --- Correcciones (admin) -----------------------------------------------

// Lectura de una fila para el diálogo de corrección: mismo alcance que
// corregirla (404 fuera de la empresa o de la tienda del usuario).
export const findEmployeeDebtController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const debt = await findEmployeeDebtById({ debtId: Number(req.params.id), scope: resolveWriteScope(user) });
  ok(res, 200, debt, "Deuda obtenida correctamente");
});

export const findEmployeeDebtPaymentController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const payment = await findEmployeeDebtPaymentById({ paymentId: Number(req.params.id), scope: resolveWriteScope(user) });
  ok(res, 200, payment, "Reposición obtenida correctamente");
});

export const correctManualEmployeeDebtController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const result = await correctManualEmployeeDebt({
    debtId: Number(req.params.id),
    input: {
      amount: req.body.amount,
      description: req.body.description,
      category: req.body.category,
      incurred_at: req.body.incurred_at,
      business_unit_id: req.body.business_unit_id,
      user_id: req.body.user_id,
      reason: String(req.body.reason),
    },
    scope: resolveWriteScope(user),
    actorId: user.userId,
  });
  ok(res, 200, result, "Deuda corregida correctamente");
});

export const correctEmployeeDebtPaymentController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const result = await correctEmployeeDebtPayment({
    paymentId: Number(req.params.id),
    input: {
      amount: req.body.amount,
      paid_at: req.body.paid_at,
      payment_account_id: req.body.payment_account_id,
      operation_number: req.body.operation_number,
      reason: String(req.body.reason),
    },
    scope: resolveWriteScope(user),
    actorId: user.userId,
  });
  ok(res, 200, result, "Reposición corregida: Caja y las deudas del trabajador se recalcularon");
});

// Historiales: alcance de LECTURA del módulo (la empresa de la sesión).
export const listEmployeeDebtCorrectionsController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const resp = await getEmployeeDebtCorrections({
    debtId: Number(req.params.id),
    companyId: user.isSystem ? null : user.companyId,
    ...parsePage(req.query),
  });
  ok(res, 200, resp, resp.data.length === 0 ? "Esta deuda no tiene correcciones" : "Historial obtenido correctamente");
});

export const listEmployeeDebtPaymentCorrectionsController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const resp = await getEmployeeDebtPaymentCorrections({
    paymentId: Number(req.params.id),
    companyId: user.isSystem ? null : user.companyId,
    ...parsePage(req.query),
  });
  ok(res, 200, resp, resp.data.length === 0 ? "Esta reposición no tiene correcciones" : "Historial obtenido correctamente");
});

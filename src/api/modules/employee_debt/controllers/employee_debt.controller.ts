import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { AppError } from "../../../../core/errors/AppError";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import {
  EmployeeDebtStatusFilter,
  getEmployeeDebtSummary,
} from "../services/find/employee_debt.service";
import { markEmployeeDebtAsPaid } from "../services/update/employee_debt.service";
import { DataBase } from "../../../../database";
import { resolvePaymentAccountId } from "../../variable_general/services/shared/payment_account.service";

const STATUS_FILTERS: EmployeeDebtStatusFilter[] = ["pending", "paid", "all"];

const NO_RESULTS_MESSAGE: Record<EmployeeDebtStatusFilter, string> = {
  pending: "No hay deudas pendientes con el personal",
  paid: "Todavía no se repuso ninguna deuda",
  all: "No hay deudas registradas con el personal",
};

export const listEmployeeDebtsController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const page = Number(req.query.page) || 1;
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  // Por defecto "pending" (pedido explícito del usuario).
  const status = STATUS_FILTERS.find((value) => value === req.query.status) ?? "pending";
  const userId = Number(req.query.userId) > 0 ? Number(req.query.userId) : undefined;

  const resp = await getEmployeeDebtSummary({
    companyId: user.isSystem ? null : user.companyId,
    status,
    userId,
    dateFrom: (req.query.dateFrom as string) || undefined,
    dateTo: (req.query.dateTo as string) || undefined,
    page,
    limit,
  });

  const message = resp.data.length === 0 ? NO_RESULTS_MESSAGE[status] : "Lista de deudas obtenida correctamente";
  ok(res, 200, resp, message);
});

export const payEmployeeDebtController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { userId } = req.params;

  const employee = await DataBase.instance.user.findOne({ where: { id: Number(userId) } });
  if (!employee) throw new AppError(404, "El trabajador no existe");
  if (!user.isSystem && employee.company_id !== user.companyId) {
    throw new AppError(403, "Este trabajador no pertenece a tu empresa");
  }
  const employeeCompanyId = employee.company_id;
  if (employeeCompanyId === null || employeeCompanyId === undefined) {
    throw new AppError(400, "El trabajador no pertenece a ninguna empresa");
  }

  // Desde qué cuenta se le repuso (vacío = efectivo); siempre de la empresa
  // del trabajador.
  const paymentAccountId = await resolvePaymentAccountId({
    accountId: req.body?.payment_account_id,
    companyId: employeeCompanyId,
    required: false,
  });

  const result = await markEmployeeDebtAsPaid({
    userId: Number(userId),
    companyId: user.isSystem ? null : user.companyId,
    paymentAccountId,
    updatedBy: user.userId,
  });

  ok(res, 200, result, "Deuda saldada correctamente");
});

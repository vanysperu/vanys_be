import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { AppError } from "../../../../core/errors/AppError";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { getEmployeeDebtSummary } from "../services/find/employee_debt.service";
import { markEmployeeDebtAsPaid } from "../services/update/employee_debt.service";
import { DataBase } from "../../../../database";

export const listEmployeeDebtsController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const page = Number(req.query.page) || 1;
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  const resp = await getEmployeeDebtSummary({ companyId: user.isSystem ? null : user.companyId, page, limit });

  const message = resp.data.length === 0 ? "No hay deudas pendientes con el personal" : "Lista de deudas obtenida correctamente";
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

  const result = await markEmployeeDebtAsPaid({
    userId: Number(userId),
    companyId: user.isSystem ? null : user.companyId,
    updatedBy: user.userId,
  });

  ok(res, 200, result, "Deuda saldada correctamente");
});

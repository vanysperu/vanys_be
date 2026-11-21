import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { parsePaginationParams } from "../../../../core/validators/pagination.validator";
import { resolveListCompanyFilter } from "../../../../core/rbac/companyScope";
import { resolveBusinessUnitFilter } from "../../../../core/rbac/businessUnitScope";
import { listLoansService } from "../services/list.service";
import { LOAN_STATUS_FILTERS } from "../types/loan.types";

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);

// GET /api/loan/list?page&limit&status&search&dateFrom&dateTo&companyId
// Empresa y tienda salen de la sesión (el Super Administrador puede acotar con ?companyId).
export const listLoansController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { page, limit } = parsePaginationParams(req.query);
  const result = await listLoansService({
    companyId: resolveListCompanyFilter(user, req.query.companyId),
    businessUnitId: resolveBusinessUnitFilter(user),
    status: LOAN_STATUS_FILTERS.find((value) => value === req.query.status),
    search: text(req.query.search),
    dateFrom: text(req.query.dateFrom),
    dateTo: text(req.query.dateTo),
    page,
    limit,
  });
  ok(res, 200, result, result.data.length === 0 ? "No hay préstamos" : "Préstamos obtenidos correctamente");
});

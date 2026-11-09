import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { resolveListCompanyFilter } from "../../../../core/rbac/companyScope";
import { resolveBusinessUnitFilter } from "../../../../core/rbac/businessUnitScope";
import { listCashTransfersService } from "../services/find/list.service";

const textOrUndefined = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined;

// GET /cash-movement/transfer/list?page&limit&orderDir&dateFrom&dateTo(&companyId)
export const listCashTransfersController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;

  const result = await listCashTransfersService({
    // Solo el Super Administrador puede acotar a otra empresa (?companyId).
    companyId: resolveListCompanyFilter(user, req.query.companyId),
    businessUnitId: resolveBusinessUnitFilter(user),
    dateFrom: textOrUndefined(req.query.dateFrom),
    dateTo: textOrUndefined(req.query.dateTo),
    page: Number(req.query.page) || 1,
    limit: Math.min(Number(req.query.limit) || 20, 100),
    orderDir: req.query.orderDir === "asc" ? "asc" : "desc",
  });

  const message = result.data.length === 0 ? "No se encontraron transferencias" : "Lista de transferencias obtenida correctamente";
  ok(res, 200, result, message);
});

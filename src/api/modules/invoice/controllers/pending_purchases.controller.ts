import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { resolveListCompanyFilter } from "../../../../core/rbac/companyScope";
import { parsePaginationParams } from "../../../../core/validators/pagination.validator";
import { listPendingPurchasesService } from "../services/pending_purchases.service";
import { invoiceActorOf } from "./actor";

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
const positive = (value: unknown) => (Number(value) > 0 ? Number(value) : undefined);

// GET /invoice/pending-purchases?page=&limit=&includeNotRequired=&storeId=&quotationId=&search=&dateFrom=&dateTo=&companyId=
// La empresa y la tienda del usuario salen de la sesión; storeId solo afina
// dentro de lo que ya puede ver (un usuario de tienda no sale de la suya).
export const listPendingPurchasesController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { page, limit } = parsePaginationParams(req.query);
  const result = await listPendingPurchasesService({
    companyId: resolveListCompanyFilter(user, req.query.companyId),
    businessUnitId: invoiceActorOf(user).businessUnitId,
    storeId: positive(req.query.storeId),
    includeNotRequired: req.query.includeNotRequired === "true",
    quotationId: positive(req.query.quotationId),
    search: text(req.query.search),
    dateFrom: text(req.query.dateFrom),
    dateTo: text(req.query.dateTo),
    page,
    limit,
  });
  ok(res, 200, result, result.data.length === 0 ? "No hay compras sin factura" : "Compras obtenidas correctamente");
});

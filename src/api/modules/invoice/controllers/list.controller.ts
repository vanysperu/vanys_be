import { Request, Response } from "express";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { parsePaginationParams } from "../../../../core/validators/pagination.validator";
import { listInvoicesService } from "../services/list.service";
import { invoiceFiltersFromRequest } from "./list_filters";

// GET /invoice/list?page=&limit=&type=&file=&drive=&supplierId=&search=&dateFrom=&dateTo=&companyId=
// Mismos filtros que la exportación a Excel (controllers/list_filters.ts).
export const listInvoicesController = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = parsePaginationParams(req.query);
  const result = await listInvoicesService({ ...invoiceFiltersFromRequest(req), page, limit });
  ok(res, 200, result, result.data.length === 0 ? "No hay facturas" : "Facturas obtenidas correctamente");
});

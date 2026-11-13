import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { resolveListCompanyFilter } from "../../../../core/rbac/companyScope";
import { parsePaginationParams } from "../../../../core/validators/pagination.validator";
import { InvoiceDriveStatus, InvoiceType } from "../model/invoice.model";
import { listInvoicesService } from "../services/list.service";
import { invoiceActorOf } from "./actor";

const TYPES: InvoiceType[] = ["issued", "purchase"];
const FILE_FILTERS = ["pending", "uploaded"] as const;
const DRIVE_STATUSES: InvoiceDriveStatus[] = ["none", "pending", "copied", "failed"];
const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);

// GET /invoice/list?page=&limit=&type=&file=&drive=&supplierId=&search=&dateFrom=&dateTo=&companyId=
export const listInvoicesController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { page, limit } = parsePaginationParams(req.query);
  const result = await listInvoicesService({
    companyId: resolveListCompanyFilter(user, req.query.companyId),
    businessUnitId: invoiceActorOf(user).businessUnitId,
    type: TYPES.find((value) => value === req.query.type),
    file: FILE_FILTERS.find((value) => value === req.query.file),
    drive: DRIVE_STATUSES.find((value) => value === req.query.drive),
    supplierId: Number(req.query.supplierId) > 0 ? Number(req.query.supplierId) : undefined,
    search: text(req.query.search),
    dateFrom: text(req.query.dateFrom),
    dateTo: text(req.query.dateTo),
    page,
    limit,
  });
  ok(res, 200, result, result.data.length === 0 ? "No hay facturas" : "Facturas obtenidas correctamente");
});

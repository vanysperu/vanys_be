import { Request } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { resolveListCompanyFilter } from "../../../../core/rbac/companyScope";
import { InvoiceDriveStatus, InvoiceType } from "../model/invoice.model";
import { InvoiceListFilter } from "../types/invoice.types";
import { invoiceActorOf } from "./actor";

const TYPES: InvoiceType[] = ["issued", "purchase"];
const FILE_FILTERS = ["pending", "uploaded"] as const;
const DRIVE_STATUSES: InvoiceDriveStatus[] = ["none", "pending", "copied", "failed"];
const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);

// Filtros de Facturas a partir del query (sin página). Los comparten el
// listado y su exportación a Excel (21-nov).
export const invoiceFiltersFromRequest = (req: Request): Omit<InvoiceListFilter, "page" | "limit"> => {
  const user = req.user as IToken;
  return {
    companyId: resolveListCompanyFilter(user, req.query.companyId),
    businessUnitId: invoiceActorOf(user).businessUnitId,
    type: TYPES.find((value) => value === req.query.type),
    file: FILE_FILTERS.find((value) => value === req.query.file),
    drive: DRIVE_STATUSES.find((value) => value === req.query.drive),
    supplierId: Number(req.query.supplierId) > 0 ? Number(req.query.supplierId) : undefined,
    search: text(req.query.search),
    dateFrom: text(req.query.dateFrom),
    dateTo: text(req.query.dateTo),
  };
};

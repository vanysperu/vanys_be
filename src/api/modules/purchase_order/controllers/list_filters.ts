import { Request } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { resolveListCompanyFilter } from "../../../../core/rbac/companyScope";
import { resolveBusinessUnitFilter } from "../../../../core/rbac/businessUnitScope";
import { PurchaseOrderListFilter } from "../services/find/purchase_order.service";

// Filtros de Órdenes de compra a partir del query (sin página ni orden). Los
// comparten el listado y su exportación a Excel (21-nov).
export const purchaseOrderFiltersFromRequest = (
  req: Request
): Omit<PurchaseOrderListFilter, "page" | "limit" | "orderBy" | "orderDir"> => {
  const user = req.user as IToken;
  const { status, assignedToMe, quotationId, clientName, assigneeName, assignedTo: assignedToParam, dateFrom, dateTo } = req.query;
  // "assignedToMe=1": cualquier usuario ve SUS propias órdenes sin
  // necesitar el módulo completo de compras — es lo que alimenta el
  // widget del Inicio, no requiere ser admin.
  // "assignedTo=<id>": filtro por persona desde la lista (selector de
  // trabajador); "assignedToMe" tiene prioridad.
  const assignedTo = assignedToMe ? user.userId : Number(assignedToParam) > 0 ? Number(assignedToParam) : undefined;
  return {
    companyId: resolveListCompanyFilter(user, req.query.companyId),
    businessUnitId: resolveBusinessUnitFilter(user),
    assignedTo,
    status: (status as string) || undefined,
    clientName: (clientName as string) || undefined,
    assigneeName: (assigneeName as string) || undefined,
    quotationId: quotationId ? Number(quotationId) : undefined,
    dateFrom,
    dateTo,
  };
};

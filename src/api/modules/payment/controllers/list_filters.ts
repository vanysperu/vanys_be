import { Request } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { resolveBusinessUnitFilter } from "../../../../core/rbac/businessUnitScope";
import { PaymentListFilter, PaymentStatusFilter } from "../services/find/payment.service";

const PAYMENT_STATUS_FILTERS: PaymentStatusFilter[] = ["active", "disabled", "all"];

// Filtros de Pagos a partir del query (sin página). Los comparten el listado
// y su exportación a Excel (21-nov). La empresa/tienda nunca se confía del
// query: sale del token (CLAUDE.md sección 10/11.1).
export const paymentFiltersFromRequest = (req: Request): Omit<PaymentListFilter, "page" | "limit"> => {
  const user = req.user as IToken;
  const { quotationId, method, dateFrom, dateTo, includeDisabled, status, paymentAccountId, clientName } = req.query;
  // `includeDisabled=true` se mantiene por compatibilidad: equivale a "all".
  const requestedStatus = PAYMENT_STATUS_FILTERS.find((value) => value === status);
  const statusFilter: PaymentStatusFilter = requestedStatus ?? (includeDisabled === "true" ? "all" : "active");
  return {
    companyId: user.isSystem ? null : user.companyId,
    businessUnitId: resolveBusinessUnitFilter(user),
    quotationId: quotationId ? Number(quotationId) : undefined,
    method: (method as string) || undefined,
    paymentAccountId: paymentAccountId === "cash" ? "cash" : Number(paymentAccountId) > 0 ? Number(paymentAccountId) : undefined,
    clientName: typeof clientName === "string" && clientName.trim() ? clientName.trim() : undefined,
    dateFrom: (dateFrom as string) || undefined,
    dateTo: (dateTo as string) || undefined,
    status: statusFilter,
  };
};

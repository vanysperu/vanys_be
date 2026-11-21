import { Request } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { resolveListCompanyFilter } from "../../../../core/rbac/companyScope";
import { resolveBusinessUnitFilter } from "../../../../core/rbac/businessUnitScope";
import { CASH_FLOW_SOURCES, CashMovementListFilter } from "../services/find/cash_movement.service";

// Filtros de Caja a partir del query (sin página). Los comparten el listado y
// su exportación a Excel (21-nov): el Excel trae lo mismo que la pantalla.
export const cashMovementFiltersFromRequest = (req: Request): Omit<CashMovementListFilter, "page" | "limit"> => {
  const user = req.user as IToken;
  const { direction, category, quotationId, purchaseOrderId, dateFrom, dateTo, source, paymentAccountId } = req.query;
  return {
    // El Super Administrador puede acotar a una empresa (?companyId): sin eso,
    // sus totales mezclan la plata de todas.
    companyId: resolveListCompanyFilter(user, req.query.companyId),
    businessUnitId: resolveBusinessUnitFilter(user),
    direction: direction === "income" || direction === "expense" ? direction : undefined,
    category: (category as string) || undefined,
    // Incluye "transfer" (transferencias entre cuentas).
    source: CASH_FLOW_SOURCES.find((value) => value === source),
    paymentAccountId: paymentAccountId === "cash" ? "cash" : Number(paymentAccountId) > 0 ? Number(paymentAccountId) : undefined,
    quotationId: quotationId ? Number(quotationId) : undefined,
    purchaseOrderId: purchaseOrderId ? Number(purchaseOrderId) : undefined,
    dateFrom: (dateFrom as string) || undefined,
    dateTo: (dateTo as string) || undefined,
  };
};

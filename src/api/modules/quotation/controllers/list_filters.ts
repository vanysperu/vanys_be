import { Request } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { resolveListCompanyFilter } from "../../../../core/rbac/companyScope";
import { resolveBusinessUnitFilter } from "../../../../core/rbac/businessUnitScope";

// Filtros del listado de cotizaciones a partir del query. Lo comparten el
// listado y su exportación a Excel (21-nov): el Excel trae exactamente lo
// mismo que se ve en pantalla.
export const quotationListFiltersFromRequest = (req: Request) => {
  const user = req.user as IToken;
  const queryParams = req.query;
  // Tienda: si el caller está limitado a una, manda esa (nunca la del query).
  // Si no, puede filtrar por cualquiera — el filtro de empresa sigue
  // aplicando, así que una tienda ajena simplemente no trae resultados.
  const scopedBusinessUnitId = resolveBusinessUnitFilter(user);
  const requestedBusinessUnitId = Number(queryParams.businessUnitId) > 0 ? Number(queryParams.businessUnitId) : undefined;
  return {
    companyId: resolveListCompanyFilter(user, queryParams.companyId),
    businessUnitId: scopedBusinessUnitId ?? requestedBusinessUnitId,
    status: (queryParams.status as string) || undefined,
    clientId: queryParams.clientId ? Number(queryParams.clientId) : undefined,
    createdBy: Number(queryParams.createdBy) > 0 ? Number(queryParams.createdBy) : undefined,
    dateFrom: queryParams.dateFrom,
    dateTo: queryParams.dateTo,
  };
};

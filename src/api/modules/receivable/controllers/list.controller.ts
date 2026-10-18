import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { resolveBusinessUnitFilter } from "../../../../core/rbac/businessUnitScope";
import { QuotationStatus } from "../../quotation/model/quotation.model";
import { getReceivablesList, ReceivableOrderBy } from "../services/find/receivable.service";

// Empresa y tienda salen SIEMPRE del token (CLAUDE.md sección 10/11.1). La
// tienda pedida por query solo se respeta si el usuario no está limitado a
// una (mismo criterio que el listado de cotizaciones).
export const listReceivablesController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { status, clientName, dateFrom, dateTo, orderBy, orderDir } = req.query;
  const page = Number(req.query.page) || 1;
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  const scopedBusinessUnitId = resolveBusinessUnitFilter(user);
  const requestedBusinessUnitId = Number(req.query.businessUnitId) > 0 ? Number(req.query.businessUnitId) : undefined;

  const resp = await getReceivablesList({
    companyId: user.isSystem ? null : user.companyId,
    businessUnitId: scopedBusinessUnitId ?? requestedBusinessUnitId,
    status: (status as QuotationStatus) || undefined,
    clientName: typeof clientName === "string" && clientName.trim() ? clientName.trim() : undefined,
    dateFrom: (dateFrom as string) || undefined,
    dateTo: (dateTo as string) || undefined,
    // Por defecto, lo más antiguo primero: es lo que más urge cobrar.
    orderBy: (orderBy as ReceivableOrderBy) || "created_at",
    orderDir: orderDir === "desc" ? "desc" : "asc",
    page,
    limit,
  });

  const message = resp.data.length === 0 ? "No hay saldos pendientes de cobro" : "Saldos por cobrar obtenidos correctamente";
  ok(res, 200, resp, message);
});

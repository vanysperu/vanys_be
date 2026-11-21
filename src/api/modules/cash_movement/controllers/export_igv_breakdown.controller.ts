import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { sendXlsx } from "../../../../core/excel/excel_export";
import { resolveListCompanyFilter } from "../../../../core/rbac/companyScope";
import { resolveBusinessUnitFilter } from "../../../../core/rbac/businessUnitScope";
import { exportIgvBreakdownService } from "../services/export/export_igv_breakdown.service";

// GET /cash-movement/igv-breakdown/export?period=YYYY-MM — el detalle del IGV
// del mes en Excel (21-nov). Mismo alcance que el diálogo.
export const exportIgvBreakdownController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { period, sheets } = await exportIgvBreakdownService(
    { companyId: resolveListCompanyFilter(user, req.query.companyId), businessUnitId: resolveBusinessUnitFilter(user) ?? null },
    (req.query.period as string) || undefined
  );
  await sendXlsx(res, `igv-${period}.xlsx`, sheets);
});

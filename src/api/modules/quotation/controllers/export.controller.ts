import { Request, Response } from "express";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { sendXlsx } from "../../../../core/excel/excel_export";
import { todayInBusinessTz } from "../../../../utils/dateUtils";
import { exportQuotationsService } from "../services/export/export_quotations.service";
import { quotationListFiltersFromRequest } from "./list_filters";

// GET /quotation/export — el listado de cotizaciones en Excel, con los mismos
// filtros y el mismo alcance que en pantalla (21-nov).
export const exportQuotationsController = asyncHandler(async (req: Request, res: Response) => {
  const sheet = await exportQuotationsService(quotationListFiltersFromRequest(req));
  await sendXlsx(res, `cotizaciones-${todayInBusinessTz()}.xlsx`, [sheet]);
});

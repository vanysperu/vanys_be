import { Request, Response } from "express";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { sendXlsx } from "../../../../core/excel/excel_export";
import { todayInBusinessTz } from "../../../../utils/dateUtils";
import { exportInvoicesService } from "../services/export/export_invoices.service";
import { invoiceFiltersFromRequest } from "./list_filters";

// GET /invoice/export — Facturas en Excel con los mismos filtros (21-nov).
export const exportInvoicesController = asyncHandler(async (req: Request, res: Response) => {
  const sheet = await exportInvoicesService(invoiceFiltersFromRequest(req));
  await sendXlsx(res, `facturas-${todayInBusinessTz()}.xlsx`, [sheet]);
});

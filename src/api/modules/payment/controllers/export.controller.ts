import { Request, Response } from "express";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { sendXlsx } from "../../../../core/excel/excel_export";
import { todayInBusinessTz } from "../../../../utils/dateUtils";
import { exportPaymentsService } from "../services/export/export_payments.service";
import { paymentFiltersFromRequest } from "./list_filters";

// GET /payment/export — Pagos en Excel con los mismos filtros (21-nov).
export const exportPaymentsController = asyncHandler(async (req: Request, res: Response) => {
  const sheet = await exportPaymentsService(paymentFiltersFromRequest(req));
  await sendXlsx(res, `pagos-${todayInBusinessTz()}.xlsx`, [sheet]);
});

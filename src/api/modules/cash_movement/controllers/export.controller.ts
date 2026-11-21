import { Request, Response } from "express";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { sendXlsx } from "../../../../core/excel/excel_export";
import { todayInBusinessTz } from "../../../../utils/dateUtils";
import { exportCashMovementsService } from "../services/export/export_cash_movements.service";
import { cashMovementFiltersFromRequest } from "./list_filters";

// GET /cash-movement/export — Caja en Excel con los mismos filtros (21-nov).
export const exportCashMovementsController = asyncHandler(async (req: Request, res: Response) => {
  const sheets = await exportCashMovementsService(cashMovementFiltersFromRequest(req));
  await sendXlsx(res, `caja-${todayInBusinessTz()}.xlsx`, sheets);
});

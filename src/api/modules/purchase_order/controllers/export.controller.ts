import { Request, Response } from "express";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { sendXlsx } from "../../../../core/excel/excel_export";
import { todayInBusinessTz } from "../../../../utils/dateUtils";
import { exportPurchaseOrdersService } from "../services/export/export_purchase_orders.service";
import { purchaseOrderFiltersFromRequest } from "./list_filters";

// GET /purchase-order/export — Órdenes de compra en Excel (21-nov).
export const exportPurchaseOrdersController = asyncHandler(async (req: Request, res: Response) => {
  const sheet = await exportPurchaseOrdersService(purchaseOrderFiltersFromRequest(req));
  await sendXlsx(res, `ordenes-de-compra-${todayInBusinessTz()}.xlsx`, [sheet]);
});

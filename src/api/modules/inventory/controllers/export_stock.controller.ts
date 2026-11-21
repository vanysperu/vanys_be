import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { sendXlsx } from "../../../../core/excel/excel_export";
import { todayInBusinessTz } from "../../../../utils/dateUtils";
import { resolveCompanyForInventory } from "../services/shared/inventory_company";
import { exportStockService } from "../services/export/export_stock.service";

// GET /api/inventory/stock/export — el stock en Excel con los mismos filtros
// del listado (21-nov).
export const exportStockController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const companyId = await resolveCompanyForInventory(user, req.query.companyId);
  const sheet = await exportStockService(
    {
      companyId,
      warehouseId: Number(req.query.warehouseId) || undefined,
      searchTerm: typeof req.query.searchTerm === "string" ? req.query.searchTerm : undefined,
      includeZero: String(req.query.includeZero) === "true",
    },
    user
  );
  await sendXlsx(res, `stock-${todayInBusinessTz()}.xlsx`, [sheet]);
});

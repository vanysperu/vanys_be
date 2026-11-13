import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { parsePaginationParams } from "../../../../core/validators/pagination.validator";
import { resolveCompanyForInventory } from "../services/shared/inventory_company";
import { listWarehousesService } from "../services/warehouses/list_warehouses.service";

// GET /api/inventory/warehouses
export const listWarehousesController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const companyId = await resolveCompanyForInventory(user, req.query.companyId);
  const { page, limit } = parsePaginationParams(req.query);
  const result = await listWarehousesService(
    { companyId, page, limit, onlyActive: String(req.query.onlyActive) === "true", businessUnitId: Number(req.query.businessUnitId) || undefined },
    user
  );
  ok(res, 200, result);
});

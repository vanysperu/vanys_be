import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { parsePaginationParams } from "../../../../core/validators/pagination.validator";
import { resolveCompanyForInventory } from "../services/shared/inventory_company";
import { listStoresService } from "../services/stores/list_stores.service";

// GET /api/inventory/stores — tiendas con su configuración de inventario
export const listStoresController = asyncHandler(async (req: Request, res: Response) => {
  const companyId = await resolveCompanyForInventory(req.user as IToken, req.query.companyId);
  const { page, limit } = parsePaginationParams(req.query);
  ok(res, 200, await listStoresService(companyId, page, limit));
});

import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { resolveCompanyForInventory } from "../services/shared/inventory_company";
import { createWarehouseService } from "../services/warehouses/create_warehouse.service";
import type { WarehouseInput } from "../types/inventory.types";

// POST /api/inventory/warehouses
export const createWarehouseController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const companyId = await resolveCompanyForInventory(user, req.body.company_id);
  ok(res, 201, await createWarehouseService(companyId, req.body as WarehouseInput, user), "Almacén creado");
});

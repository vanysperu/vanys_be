import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { updateWarehouseService } from "../services/warehouses/update_warehouse.service";
import type { WarehouseInput } from "../types/inventory.types";

// PUT /api/inventory/warehouses/:id
export const updateWarehouseController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, 200, await updateWarehouseService(Number(req.params.id), req.body as WarehouseInput, req.user as IToken), "Almacén actualizado");
});

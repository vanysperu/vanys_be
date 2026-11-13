import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { toggleWarehouseService } from "../services/warehouses/toggle_warehouse.service";

// PUT /api/inventory/warehouses/:id/disable — deshabilita o vuelve a habilitar
export const toggleWarehouseController = asyncHandler(async (req: Request, res: Response) => {
  const warehouse = await toggleWarehouseService(Number(req.params.id), req.user as IToken);
  ok(res, 200, warehouse, warehouse.active ? "Almacén habilitado" : "Almacén deshabilitado");
});

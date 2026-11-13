import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { updateSupplierService } from "../services/update.service";
import type { SupplierInput } from "../types/supplier.types";

// PUT /api/supplier/update/:id (la empresa del proveedor no cambia).
export const updateSupplierController = asyncHandler(async (req: Request, res: Response) => {
  const supplier = await updateSupplierService(Number(req.params.id), req.body as SupplierInput, req.user as IToken);
  ok(res, 200, supplier, "Proveedor actualizado correctamente");
});

import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { toggleSupplierStatusService } from "../services/disable.service";

// PUT /api/supplier/disable/:id — deshabilita o vuelve a habilitar.
export const disableSupplierController = asyncHandler(async (req: Request, res: Response) => {
  const supplier = await toggleSupplierStatusService(Number(req.params.id), req.user as IToken);
  ok(res, 200, supplier, supplier.active ? "Proveedor habilitado" : "Proveedor deshabilitado");
});

import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { resolveTargetCompanyId } from "../../../../core/rbac/companyScope";
import { createSupplierService } from "../services/create.service";
import type { SupplierInput } from "../types/supplier.types";

// POST /api/supplier/create
export const createSupplierController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const companyId = await resolveTargetCompanyId(user, req.body.company_id, "proveedores");
  const supplier = await createSupplierService(companyId, req.body as SupplierInput, user.userId);
  ok(res, 201, supplier, "Proveedor creado correctamente");
});

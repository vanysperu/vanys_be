import { Request, Response } from "express";
import { AppError } from "../../../../core/errors/AppError";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { bulkUpsertProductsService } from "../services/bulk.service";
import { BulkProductsRequest } from "../types/public_product.types";

// POST /public/products/bulk — crea o actualiza (por SKU) productos de la
// empresa de la key y, con replicate, de las empresas extra permitidas.
export const bulkProductsController = asyncHandler(async (req: Request, res: Response) => {
  const apiKey = req.apiKey;
  if (!apiKey) throw new AppError(401, "API key inválida o revocada", undefined, "INVALID_API_KEY");

  const { replicate, company_ids, products } = req.body as BulkProductsRequest;
  const result = await bulkUpsertProductsService({ replicate, company_ids, products }, apiKey);

  const message =
    result.summary.failed === 0
      ? "Productos guardados correctamente"
      : `${result.summary.failed} producto(s) con error; el resto se guardó`;
  return ok(res, 200, result, message);
});

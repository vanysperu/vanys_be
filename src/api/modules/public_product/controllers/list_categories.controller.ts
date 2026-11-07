import { Request, Response } from "express";
import { AppError } from "../../../../core/errors/AppError";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { parsePaginationParams } from "../../../../core/validators/pagination.validator";
import { listPublicCategoriesService } from "../services/list_categories.service";

// GET /public/product-categories?page=&limit=&search=&include_global=true
// Categorías (con sus subcategorías) de la empresa de la key, con cuántos
// productos activos de la búsqueda (`search`) tiene cada una y un resumen.
// Las globales solo llegan si se piden con include_global=true.
export const listPublicCategoriesController = asyncHandler(async (req: Request, res: Response) => {
  const apiKey = req.apiKey;
  if (!apiKey) throw new AppError(401, "API key inválida o revocada", undefined, "INVALID_API_KEY");

  const { page, limit } = parsePaginationParams(req.query);
  const search = typeof req.query.search === "string" && req.query.search.trim() ? req.query.search.trim() : undefined;
  const includeGlobal = req.query.include_global === "true";
  const result = await listPublicCategoriesService({ companyId: apiKey.companyId, page, limit, search, includeGlobal });

  ok(res, 200, result, result.data.length === 0 ? "No se encontraron categorías" : "Categorías obtenidas correctamente");
});

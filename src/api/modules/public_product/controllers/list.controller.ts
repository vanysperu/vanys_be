import { Request, Response } from "express";
import { AppError } from "../../../../core/errors/AppError";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { parsePaginationParams } from "../../../../core/validators/pagination.validator";
import { listPublicProductsService } from "../services/list.service";
import { parseSkuList } from "../validators/public_product.validator";

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
const positiveId = (value: unknown) => (Number(value) > 0 ? Number(value) : undefined);
// `skus=` vacío = sin filtro; `skus=,,` = una lista sin SKU (no devuelve nada).
const skuList = (value: unknown) => (typeof value === "string" && value ? parseSkuList(value) : undefined);

// GET /public/products?page=&limit=&search=&sku=&skus=&code=&category_id=&without_category=&subcategory_id=&color=&orderBy=&orderDir=
// Catálogo activo de la empresa de la key (la empresa nunca sale del query).
export const listPublicProductsController = asyncHandler(async (req: Request, res: Response) => {
  const apiKey = req.apiKey;
  if (!apiKey) throw new AppError(401, "API key inválida o revocada", undefined, "INVALID_API_KEY");

  const { page, limit, orderBy, orderDir } = parsePaginationParams(req.query);
  const result = await listPublicProductsService({
    companyId: apiKey.companyId,
    page,
    limit,
    orderBy,
    orderDir,
    search: text(req.query.search),
    sku: text(req.query.sku),
    skus: skuList(req.query.skus),
    categoryId: positiveId(req.query.category_id),
    withoutCategory: req.query.without_category === "true",
    subcategoryId: positiveId(req.query.subcategory_id),
    color: text(req.query.color),
    code: text(req.query.code),
    baseUrl: `${req.protocol}://${req.get("host")}`,
  });

  ok(res, 200, result, result.data.length === 0 ? "No se encontraron productos" : "Productos obtenidos correctamente");
});

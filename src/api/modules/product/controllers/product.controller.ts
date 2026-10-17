import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { AppError } from "../../../../core/errors/AppError";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { createProduct } from "../services/create/product.service";
import { updateProductById } from "../services/update/product.service";
import { getProductById, getProductsList } from "../services/find/product.service";
import { disableOrEnableProductById } from "../services/delete/product.service";
import { parsePaginationParams } from "../../../../core/validators/pagination.validator";

export const createProductController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;

  // Un producto SIEMPRE pertenece a una empresa específica (no existe
  // "producto global") — un super administrador no gestiona el catálogo
  // operativo de ninguna empresa en particular, eso es responsabilidad
  // del admin de esa empresa (pedido explícito del usuario).
  if (user.isSystem) {
    throw new AppError(403, "Un super administrador no puede crear productos de una empresa");
  }

  if (Number(req.body.company_id) !== user.companyId) {
    throw new AppError(403, "No puedes crear productos para otra empresa");
  }

  const product = await createProduct({ product: req.body, createdBy: user.userId });

  ok(res, 201, product, "Producto creado correctamente");
});

export const updateProductController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { id } = req.params;

  if (!(await assertProductBelongsToCaller(Number(id), user))) {
    throw new AppError(403, "No tienes acceso a este producto");
  }

  const result = await updateProductById({ product: req.body, productId: Number(id), updatedBy: user.userId });

  ok(res, 200, result, "Producto actualizado correctamente");
});

export const listProductsController = asyncHandler(async (req: Request, res: Response) => {
  const { isSystem, companyId } = req.user as IToken;
  const { page, limit, orderBy, orderDir } = parsePaginationParams(req.query);
  const searchTerm = (req.query.searchTerm as string) || undefined;
  // Filtros por columna (nombre, sku, estado): se agregan al searchTerm
  // global, no lo reemplazan.
  const name = (req.query.name as string) || undefined;
  const sku = (req.query.sku as string) || undefined;
  const status = (req.query.status as string) || undefined;

  const resp = await getProductsList({
    page,
    limit,
    orderBy,
    orderDir,
    companyId: isSystem ? null : companyId,
    searchTerm,
    name,
    sku,
    status,
  });
  const message = resp.data.length === 0 ? "No se encontraron productos" : "Lista de productos obtenida correctamente";

  ok(res, 200, resp, message);
});

export const disableProductController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { id } = req.params;

  if (!(await assertProductBelongsToCaller(Number(id), user))) {
    throw new AppError(403, "No tienes acceso a este producto");
  }

  const result = await disableOrEnableProductById({ productId: Number(id), updatedBy: user.userId });

  ok(res, 200, result, "Proceso exitoso");
});

const assertProductBelongsToCaller = async (productId: number, user: IToken): Promise<boolean> => {
  if (user.isSystem) return true;

  const product = await getProductById(productId);
  if (!product) return false;

  return product.company_id === user.companyId;
};

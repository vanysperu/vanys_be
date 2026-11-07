import { Op } from "sequelize";
import { PaginatedResult } from "../../../../core/utils/paginate";
import { getProductsList } from "../../product/services/find/product.service";
import { ProductDto } from "../../product/services/shared/product_mapper";
import { PublicProductDto } from "../types/public_product.types";
import { loadUsableCatalogIds, PublicCatalogFilter, publicCatalogConditions, publicProductOrder } from "./shared/catalog_scope";

export interface PublicProductsFilter extends PublicCatalogFilter {
  page: number;
  limit: number;
  orderBy: string;
  orderDir: "asc" | "desc";
  // "https://dominio" para armar la URL absoluta de la foto.
  baseUrl: string;
}

const toPublicProduct = (product: ProductDto, baseUrl: string, usableCatalogIds: Set<number>): PublicProductDto => {
  // Categoría deshabilitada = sin categoría (decisión de la web: la tarjeta y
  // el menú tienen que coincidir). Sin categoría vigente, tampoco subcategoría.
  const category = product.category && usableCatalogIds.has(product.category.id) ? product.category : null;
  const subcategory = category && product.subcategory && usableCatalogIds.has(product.subcategory.id) ? product.subcategory : null;
  return {
    id: Number(product.id),
    sku: product.sku,
    name: product.name,
    description: product.description,
    price_unit: product.price_unit === null ? null : Number(product.price_unit),
    price_hundred: product.price_hundred === null ? null : Number(product.price_hundred),
    price_half_thousand: product.price_half_thousand === null ? null : Number(product.price_half_thousand),
    price_thousand: product.price_thousand === null ? null : Number(product.price_thousand),
    requires_customization: Boolean(product.requires_customization),
    min_order_quantity: product.min_order_quantity === null ? null : Number(product.min_order_quantity),
    category,
    subcategory,
    colors: product.colors,
    codes: product.codes,
    // Sin fotos habilitadas para la empresa, la web tampoco la recibe.
    image_url: product.images_enabled && product.image_path ? `${baseUrl}${product.image_path}` : null,
  };
};

// Catálogo de la empresa de la key: solo productos activos, paginado. Usa el
// listado general de productos (sin duplicar la consulta) con las reglas
// propias de la web (catalog_scope.ts).
export async function listPublicProductsService(filter: PublicProductsFilter): Promise<PaginatedResult<PublicProductDto>> {
  const result = await getProductsList({
    companyId: filter.companyId,
    page: filter.page,
    limit: filter.limit,
    orderBy: filter.orderBy,
    orderDir: filter.orderDir,
    sortOrder: publicProductOrder(filter.orderBy, filter.orderDir, filter.companyId),
    // Empresa, solo activos, búsqueda ampliada, skus y categoría.
    where: { [Op.and]: publicCatalogConditions(filter) },
    sku: filter.sku,
    productSubcategoryId: filter.subcategoryId,
    color: filter.color,
    code: filter.code,
  });

  const catalogIds = result.data.flatMap((product) => [product.category?.id, product.subcategory?.id]);
  const usable = await loadUsableCatalogIds(
    filter.companyId,
    catalogIds.filter((id): id is number => id !== undefined)
  );
  return { data: result.data.map((product) => toPublicProduct(product, filter.baseUrl, usable)), meta: result.meta };
}

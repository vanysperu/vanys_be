import { PaginatedResult } from "../../../../core/utils/paginate";
import { getProductsList } from "../../product/services/find/product.service";
import { ProductDto } from "../../product/services/shared/product_mapper";
import { PublicProductDto } from "../types/public_product.types";

export interface PublicProductsFilter {
  companyId: number;
  page: number;
  limit: number;
  orderBy: string;
  orderDir: "asc" | "desc";
  search?: string;
  sku?: string;
  categoryId?: number;
  subcategoryId?: number;
  color?: string;
  code?: string;
  // "https://dominio" para armar la URL absoluta de la foto.
  baseUrl: string;
}

const toPublicProduct = (product: ProductDto, baseUrl: string): PublicProductDto => ({
  id: Number(product.id),
  sku: product.sku,
  name: product.name,
  description: product.description,
  price_unit: product.price_unit === null ? null : Number(product.price_unit),
  price_hundred: product.price_hundred === null ? null : Number(product.price_hundred),
  price_half_thousand: product.price_half_thousand === null ? null : Number(product.price_half_thousand),
  price_thousand: product.price_thousand === null ? null : Number(product.price_thousand),
  requires_customization: Boolean(product.requires_customization),
  category: product.category,
  subcategory: product.subcategory,
  colors: product.colors,
  codes: product.codes,
  // Sin fotos habilitadas para la empresa, la web tampoco la recibe.
  image_url: product.images_enabled && product.image_path ? `${baseUrl}${product.image_path}` : null,
});

// Catálogo de la empresa de la key: solo productos activos, paginado y con
// los mismos filtros que la pantalla (mismo service, sin duplicar consultas).
export async function listPublicProductsService(filter: PublicProductsFilter): Promise<PaginatedResult<PublicProductDto>> {
  const result = await getProductsList({
    companyId: filter.companyId,
    page: filter.page,
    limit: filter.limit,
    orderBy: filter.orderBy,
    orderDir: filter.orderDir,
    searchTerm: filter.search,
    sku: filter.sku,
    // NUNCA productos deshabilitados (pedido explícito del usuario): la web
    // solo muestra lo que se vende. Va como condición fija, no como el filtro
    // de estado de la pantalla, para que ningún parámetro lo pueda abrir.
    where: { is_deleted: false },
    productCategoryId: filter.categoryId,
    productSubcategoryId: filter.subcategoryId,
    color: filter.color,
    code: filter.code,
  });
  return { data: result.data.map((product) => toPublicProduct(product, filter.baseUrl)), meta: result.meta };
}

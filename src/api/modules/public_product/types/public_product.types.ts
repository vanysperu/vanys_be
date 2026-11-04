import { ProductColorDto } from "../../product/services/shared/colors";
import { ProductCodeDto } from "../../product/services/shared/codes";
import { CatalogRef } from "../../product/services/shared/product_mapper";
import { ProductWriteInput } from "../../product/services/shared/save_product";

// Un producto de la subida masiva. El SKU es obligatorio: identifica el
// producto en cada empresa (si ya existe, se actualiza; si no, se crea).
export interface BulkProductItem extends ProductWriteInput {
  sku: string;
}

export interface BulkProductsRequest {
  // true: además de la empresa de la key, se crea/actualiza el mismo
  // producto en `company_ids` (empresas permitidas a esa key).
  replicate?: boolean;
  company_ids?: number[];
  products: BulkProductItem[];
}

export type BulkProductAction = "created" | "updated";

export interface BulkProductCompanyResult {
  company_id: number;
  product_id: number;
  action: BulkProductAction;
  // Réplica: la categoría o subcategoría no existe en esta empresa y se
  // guardó sin ella.
  category_skipped?: boolean;
}

export interface BulkProductResult {
  sku: string;
  status: "ok" | "error";
  companies?: BulkProductCompanyResult[];
  error?: string;
  code?: string;
}

export interface BulkProductsResponse {
  summary: { received: number; created: number; updated: number; failed: number };
  results: BulkProductResult[];
  warnings: string[];
}

// Lo que ve la web en el listado público: sin datos internos (auditoría,
// empresa, estado) y con la foto como URL absoluta.
export interface PublicProductDto {
  id: number;
  sku: string | null;
  name: string;
  description: string | null;
  price_unit: number | null;
  price_hundred: number | null;
  price_half_thousand: number | null;
  price_thousand: number | null;
  requires_customization: boolean;
  category: CatalogRef | null;
  subcategory: CatalogRef | null;
  colors: ProductColorDto[];
  // Códigos de proveedores (el SKU va aparte).
  codes: ProductCodeDto[];
  // null si no tiene foto o si la empresa no tiene habilitadas las fotos.
  image_url: string | null;
}

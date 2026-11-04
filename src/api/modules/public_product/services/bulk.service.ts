import { Transaction } from "sequelize";
import { DataBase } from "../../../../database";
import { AppError } from "../../../../core/errors/AppError";
import { ApiKeyContext } from "../../api_key/types/api_key.types";
import { getAllowedReplicateCompanyIds } from "../../api_key/services/shared/replicate_companies";
import { keepUsableCategories } from "../../product/services/shared/catalog";
import { companiesWithProductImages, copyCompanyAsset } from "../../product/services/shared/images";
import { createProductRecord, ProductWriteInput, updateProductRecord } from "../../product/services/shared/save_product";
import {
  BulkProductCompanyResult,
  BulkProductItem,
  BulkProductResult,
  BulkProductsRequest,
  BulkProductsResponse,
} from "../types/public_product.types";

// Empresas donde se escribe: la de la key primero y, con replicate, las
// extra. Cada extra tiene que estar en la lista que el Super Administrador
// le habilitó a ESA key (pantalla API keys); si no, se rechaza todo el pedido
// antes de tocar nada.
async function resolveTargetCompanies(request: BulkProductsRequest, apiKey: ApiKeyContext): Promise<number[]> {
  const extra = request.replicate ? [...new Set((request.company_ids ?? []).map(Number))] : [];
  const others = extra.filter((id) => id !== apiKey.companyId);
  if (others.length === 0) return [apiKey.companyId];

  const allowed = await getAllowedReplicateCompanyIds(apiKey.id);
  const forbidden = others.filter((id) => !allowed.has(id));
  if (forbidden.length > 0) {
    throw new AppError(
      403,
      `Esta API key no puede replicar productos a las empresas: ${forbidden.join(", ")}. El Super Administrador las habilita en Configuración → API keys.`,
      { forbidden_company_ids: forbidden },
      "REPLICATE_NOT_ALLOWED"
    );
  }
  return [apiKey.companyId, ...others];
}

// Lista blanca de lo que la web puede escribir de un producto.
const toWriteInput = (item: BulkProductItem): ProductWriteInput => ({
  sku: item.sku.trim(),
  name: item.name,
  description: item.description,
  price_unit: item.price_unit,
  price_hundred: item.price_hundred,
  price_half_thousand: item.price_half_thousand,
  price_thousand: item.price_thousand,
  requires_customization: item.requires_customization,
  category_id: item.category_id,
  subcategory_id: item.subcategory_id,
  colors: item.colors,
  codes: item.codes,
  image_path: item.image_path,
});

// Foto para la empresa destino: la de la empresa de la key se usa tal cual
// (se valida al guardar); las demás reciben SU propia copia (cada empresa es
// dueña de sus imágenes y su limpieza solo mira las suyas).
async function imageForCompany(
  imagePath: string | null | undefined,
  companyId: number,
  apiKey: ApiKeyContext,
  transaction: Transaction
): Promise<string | null | undefined> {
  if (!imagePath || companyId === apiKey.companyId) return imagePath;
  return copyCompanyAsset({ sourcePath: imagePath, targetCompanyId: companyId, actorId: apiKey.issuedBy, transaction });
}

// Crea o actualiza (por SKU) el producto en una empresa.
async function upsertInCompany(
  item: BulkProductItem,
  companyId: number,
  apiKey: ApiKeyContext,
  transaction: Transaction
): Promise<BulkProductCompanyResult> {
  // En la empresa de la key la categoría tiene que ser válida (si no, error).
  // En una réplica, lo que no exista ahí simplemente no se guarda (pedido
  // explícito del usuario): el producto se replica igual, sin esa categoría.
  const isReplica = companyId !== apiKey.companyId;
  const categories = isReplica
    ? await keepUsableCategories({ companyId, categoryId: item.category_id, subcategoryId: item.subcategory_id, transaction })
    : { categoryId: item.category_id, subcategoryId: item.subcategory_id, dropped: false };
  const categorySkipped = categories.dropped ? { category_skipped: true } : {};

  const input = {
    ...toWriteInput(item),
    category_id: categories.categoryId,
    subcategory_id: categories.subcategoryId,
    image_path: await imageForCompany(item.image_path, companyId, apiKey, transaction),
  };
  const existing = await DataBase.instance.product.findOne({
    where: { company_id: companyId, sku: input.sku ?? "" },
    order: [["id", "ASC"]],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  // Los productos de la integración quedan a nombre de quien emitió la key
  // (no hay usuario en la sesión).
  if (existing) {
    await updateProductRecord({ product: existing, input, actorId: apiKey.issuedBy, transaction });
    return { company_id: companyId, product_id: Number(existing.id), action: "updated", ...categorySkipped };
  }
  const created = await createProductRecord({ companyId, input, actorId: apiKey.issuedBy, transaction });
  return { company_id: companyId, product_id: Number(created.id), action: "created", ...categorySkipped };
}

const describeError = (error: unknown): { error: string; code?: string } => {
  if (error instanceof AppError) return { error: error.message, code: error.code };
  // Nunca se filtra el detalle interno a la web; queda en el log del servidor.
  console.error("[public_product/bulk]", error);
  return { error: "Error interno al guardar el producto", code: "INTERNAL_ERROR" };
};

/**
 * Subida masiva desde la integración. Cada producto va en SU transacción, que
 * abarca todas las empresas destino: o queda guardado en todas, o en ninguna
 * (nunca un producto replicado a medias). Un producto con error no frena al
 * resto: se informa en `results`.
 */
export async function bulkUpsertProductsService(
  request: BulkProductsRequest,
  apiKey: ApiKeyContext
): Promise<BulkProductsResponse> {
  const targets = await resolveTargetCompanies(request, apiKey);
  const withImages = await companiesWithProductImages(targets);
  const seenSkus = new Set<string>();
  const results: BulkProductResult[] = [];

  for (const item of request.products) {
    const sku = item.sku.trim();
    const skuKey = sku.toUpperCase();
    if (seenSkus.has(skuKey)) {
      results.push({ sku, status: "error", error: "SKU repetido en este mismo pedido", code: "DUPLICATE_SKU" });
      continue;
    }
    seenSkus.add(skuKey);

    try {
      const companies = await DataBase.instance.sequelize.transaction(async (transaction) => {
        const done: BulkProductCompanyResult[] = [];
        for (const companyId of targets) done.push(await upsertInCompany(item, companyId, apiKey, transaction));
        return done;
      });
      results.push({ sku, status: "ok", companies });
    } catch (error) {
      results.push({ sku, status: "error", ...describeError(error) });
    }
  }

  const companyResults = results.flatMap((result) => result.companies ?? []);
  const sentImages = request.products.some((item) => Boolean(item.image_path));
  const withoutImages = targets.filter((companyId) => !withImages.has(companyId));
  const imageWarnings =
    sentImages && withoutImages.length > 0
      ? [
          `Las fotos se guardaron, pero no se muestran en las empresas ${withoutImages.join(", ")} porque no tienen habilitadas las fotos de productos.`,
        ]
      : [];
  // Un aviso por empresa (no uno por producto): en un envío de 200 productos
  // la lista sería ilegible. El detalle va en results[].companies[].
  const categoryWarnings = targets.flatMap((companyId) => {
    const skipped = companyResults.filter((result) => result.company_id === companyId && result.category_skipped).length;
    return skipped > 0
      ? [`En la empresa ${companyId}, ${skipped} producto(s) se guardaron sin categoría o subcategoría porque no existe ahí.`]
      : [];
  });
  const warnings = [...imageWarnings, ...categoryWarnings];

  return {
    summary: {
      received: request.products.length,
      created: companyResults.filter((result) => result.action === "created").length,
      updated: companyResults.filter((result) => result.action === "updated").length,
      failed: results.filter((result) => result.status === "error").length,
    },
    results,
    warnings,
  };
}

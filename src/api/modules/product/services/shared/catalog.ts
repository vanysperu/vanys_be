import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";

// Categorías y subcategorías de productos viven en Variables Generales
// (pedido explícito del usuario). La subcategoría guarda en `ref1` el id de su
// categoría. Pueden ser globales (company_id NULL, las crea el Super
// Administrador y sirven a todas las empresas) o de una empresa.
export const PRODUCT_CATEGORY = "product_category";
export const PRODUCT_SUBCATEGORY = "product_subcategory";

export interface ProductCategoryIds {
  category_id: number | null;
  subcategory_id: number | null;
}

const loadUsableVariable = async (
  id: number,
  category: string,
  companyId: number,
  transaction?: Transaction
) => {
  const row = await DataBase.instance.variable_general.findOne({
    where: { id, category, is_deleted: false },
    attributes: ["id", "name", "ref1", "company_id"],
    transaction,
  });
  if (!row) return null;
  // De otra empresa = como si no existiera para esta empresa.
  if (row.company_id !== null && Number(row.company_id) !== companyId) return null;
  return row;
};

/**
 * Valida la categoría/subcategoría de un producto de `companyId`:
 * - tienen que existir, estar activas y ser globales o de ESA empresa;
 * - la subcategoría tiene que colgar de la categoría elegida;
 * - si llega solo la subcategoría, la categoría se toma de ella.
 * `null` limpia; `undefined` = no se mandó (el llamador decide qué hacer).
 */
export async function resolveProductCategories({
  companyId,
  categoryId,
  subcategoryId,
  transaction,
}: {
  companyId: number;
  categoryId: number | null | undefined;
  subcategoryId: number | null | undefined;
  transaction?: Transaction;
}): Promise<ProductCategoryIds> {
  const subcategory = subcategoryId
    ? await loadUsableVariable(subcategoryId, PRODUCT_SUBCATEGORY, companyId, transaction)
    : null;
  if (subcategoryId && !subcategory) {
    throw new AppError(400, `La subcategoría ${subcategoryId} no existe, está deshabilitada o no es de esta empresa`, undefined, "INVALID_SUBCATEGORY");
  }

  const parentId = subcategory ? Number(subcategory.ref1) : null;
  const effectiveCategoryId = categoryId ?? parentId;
  const category = effectiveCategoryId
    ? await loadUsableVariable(effectiveCategoryId, PRODUCT_CATEGORY, companyId, transaction)
    : null;
  if (effectiveCategoryId && !category) {
    throw new AppError(400, `La categoría ${effectiveCategoryId} no existe, está deshabilitada o no es de esta empresa`, undefined, "INVALID_CATEGORY");
  }
  if (subcategory && parentId !== effectiveCategoryId) {
    throw new AppError(400, `La subcategoría "${subcategory.name}" no pertenece a la categoría elegida`, undefined, "INVALID_SUBCATEGORY");
  }

  return { category_id: category ? Number(category.id) : null, subcategory_id: subcategory ? Number(subcategory.id) : null };
}

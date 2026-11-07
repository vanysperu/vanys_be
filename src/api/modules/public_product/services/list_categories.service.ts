import { col, fn, literal, Op } from "sequelize";
import { DataBase } from "../../../../database";
import { buildPaginationMeta, getOffset } from "../../../../core/utils/paginate";
import { PRODUCT_CATEGORY, PRODUCT_SUBCATEGORY } from "../../product/services/shared/catalog";
import { PublicCategoriesResult, PublicSubcategoryDto } from "../types/public_product.types";
import { effectiveCategorySql, publicCatalogConditions } from "./shared/catalog_scope";

export interface PublicCategoriesFilter {
  companyId: number;
  page: number;
  limit: number;
  // Búsqueda de PRODUCTOS (el mismo `search` del catálogo): cambia las
  // cantidades, no las categorías que se listan.
  search?: string;
  // Además de las de la empresa, las globales (company_id NULL).
  includeGlobal?: boolean;
}

interface CategoryCountRow {
  effective_category_id: number | string | null;
  product_count: number | string;
}

/**
 * Productos activos por categoría vigente, para TODA la búsqueda (no solo la
 * página): una consulta agrupada. La clave null = sin categoría (o con una
 * categoría deshabilitada).
 */
async function countProductsByCategory(companyId: number, search?: string): Promise<Map<number | null, number>> {
  const rows = (await DataBase.instance.product.findAll({
    attributes: [
      [literal(effectiveCategorySql(companyId)), "effective_category_id"],
      [fn("COUNT", col("product.id")), "product_count"],
    ],
    where: { [Op.and]: publicCatalogConditions({ companyId, search }) },
    group: ["effective_category_id"],
    raw: true,
  })) as unknown as CategoryCountRow[];

  return new Map(
    rows.map((row) => [row.effective_category_id === null ? null : Number(row.effective_category_id), Number(row.product_count)])
  );
}

/**
 * Categorías de producto de la empresa de la key, con sus subcategorías
 * (pedido explícito del usuario: "solo las de la empresa y no globales"). Con
 * includeGlobal también trae las globales; nunca las de OTRA empresa. Solo
 * activas. Paginado por categoría; las subcategorías de la página van anidadas
 * y salen de UNA consulta (sin N+1).
 *
 * Cada categoría trae `product_count` (productos activos de la búsqueda) y
 * `summary` el total y los sin categoría, para el menú de la web: con
 * include_global=true, total = suma de product_count + without_category.
 */
export async function listPublicCategoriesService(filter: PublicCategoriesFilter): Promise<PublicCategoriesResult> {
  const model = DataBase.instance.variable_general;
  const companyScope = filter.includeGlobal ? { [Op.or]: [filter.companyId, null] } : filter.companyId;
  const [{ count, rows }, counts] = await Promise.all([
    model.findAndCountAll({
      where: { category: PRODUCT_CATEGORY, company_id: companyScope, is_deleted: false },
      attributes: ["id", "name", "prefix_id", "company_id"],
      order: [
        ["name", "ASC"],
        ["id", "ASC"],
      ],
      limit: filter.limit,
      offset: getOffset(filter.page, filter.limit),
    }),
    countProductsByCategory(filter.companyId, filter.search),
  ]);

  const categoryIds = rows.map((row) => String(row.id));
  const subcategories =
    categoryIds.length === 0
      ? []
      : await model.findAll({
          where: {
            category: PRODUCT_SUBCATEGORY,
            company_id: companyScope,
            is_deleted: false,
            ref1: { [Op.in]: categoryIds },
          },
          attributes: ["id", "name", "prefix_id", "ref1"],
          order: [
            ["name", "ASC"],
            ["id", "ASC"],
          ],
        });

  const byParent = new Map<string, PublicSubcategoryDto[]>();
  for (const sub of subcategories) {
    const list = byParent.get(sub.ref1) ?? [];
    list.push({ id: Number(sub.id), name: sub.name, code: sub.prefix_id });
    byParent.set(sub.ref1, list);
  }

  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  return {
    data: rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      code: row.prefix_id,
      is_global: row.company_id === null,
      // Una categoría sin resultados sigue en la lista con 0 (decisión de la web).
      product_count: counts.get(Number(row.id)) ?? 0,
      subcategories: byParent.get(String(row.id)) ?? [],
    })),
    meta: buildPaginationMeta(count, filter.page, filter.limit),
    summary: { total, without_category: counts.get(null) ?? 0 },
  };
}

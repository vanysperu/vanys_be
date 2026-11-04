import { Op } from "sequelize";
import { DataBase } from "../../../../database";
import { buildPaginationMeta, getOffset, PaginatedResult } from "../../../../core/utils/paginate";
import { PRODUCT_CATEGORY, PRODUCT_SUBCATEGORY } from "../../product/services/shared/catalog";

export interface PublicSubcategoryDto {
  id: number;
  name: string;
  code: string;
}

export interface PublicCategoryDto {
  id: number;
  name: string;
  code: string;
  subcategories: PublicSubcategoryDto[];
}

export interface PublicCategoriesFilter {
  companyId: number;
  page: number;
  limit: number;
  // Nombre de la categoría (contiene el texto).
  search?: string;
}

/**
 * Categorías de producto de la empresa de la key, con sus subcategorías
 * (pedido explícito del usuario: "solo las de la empresa y no globales").
 * Solo activas. Paginado por categoría; las subcategorías de la página van
 * anidadas y salen de UNA consulta (sin N+1). La web usa estos ids para
 * filtrar el catálogo y para la subida masiva.
 */
export async function listPublicCategoriesService(filter: PublicCategoriesFilter): Promise<PaginatedResult<PublicCategoryDto>> {
  const model = DataBase.instance.variable_general;
  const { count, rows } = await model.findAndCountAll({
    where: {
      category: PRODUCT_CATEGORY,
      company_id: filter.companyId,
      is_deleted: false,
      ...(filter.search ? { name: { [Op.like]: `%${filter.search}%` } } : {}),
    },
    attributes: ["id", "name", "prefix_id"],
    order: [
      ["name", "ASC"],
      ["id", "ASC"],
    ],
    limit: filter.limit,
    offset: getOffset(filter.page, filter.limit),
  });

  const categoryIds = rows.map((row) => String(row.id));
  const subcategories =
    categoryIds.length === 0
      ? []
      : await model.findAll({
          where: {
            category: PRODUCT_SUBCATEGORY,
            company_id: filter.companyId,
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

  return {
    data: rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      code: row.prefix_id,
      subcategories: byParent.get(String(row.id)) ?? [],
    })),
    meta: buildPaginationMeta(count, filter.page, filter.limit),
  };
}

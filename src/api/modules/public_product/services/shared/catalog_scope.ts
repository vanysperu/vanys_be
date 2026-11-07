import { literal, Op, Order, WhereOptions } from "sequelize";
import { DataBase } from "../../../../../database";
import { SearchTerm } from "../../../../../core/utils/searchTerms";
import { ProductAttributes } from "../../../product/model/product.model";
import { PRODUCT_CATEGORY, PRODUCT_SUBCATEGORY } from "../../../product/services/shared/catalog";
import { likePattern, productSearchConditions } from "../../../product/services/shared/product_search";

// Reglas del catálogo público que comparten el listado de productos y las
// cantidades por categoría, para que ambos cuenten exactamente lo mismo
// (pedido de la web: "las cantidades cuadran con el meta.total").

const escape = (value: string | number): string => DataBase.instance.sequelize.escape(value);

/**
 * Ids de categorías (o subcategorías) VIGENTES para la empresa: activas y
 * globales o de la empresa. Un producto cuya categoría no está acá (porque se
 * deshabilitó) es "sin categoría" para la web (decisión de la web).
 * `nameForms`: además, que el nombre contenga alguna de esas formas.
 */
const usableCatalogIdsSql = (kind: string, companyId: number, nameForms?: string[]): string => {
  const nameFilter = nameForms ? ` AND (${nameForms.map((form) => `gv.name LIKE ${escape(likePattern(form))}`).join(" OR ")})` : "";
  return `SELECT gv.id FROM general_variable gv WHERE gv.category = ${escape(kind)} AND gv.is_deleted = false AND (gv.company_id IS NULL OR gv.company_id = ${escape(companyId)})${nameFilter}`;
};

const usableCategoryIds = (companyId: number, nameForms?: string[]) =>
  literal(`(${usableCatalogIdsSql(PRODUCT_CATEGORY, companyId, nameForms)})`);

const usableSubcategoryIds = (companyId: number, nameForms?: string[]) =>
  literal(`(${usableCatalogIdsSql(PRODUCT_SUBCATEGORY, companyId, nameForms)})`);

/** Categoría vigente de cada producto (NULL = sin categoría), para agrupar. */
export const effectiveCategorySql = (companyId: number): string =>
  `CASE WHEN \`product\`.\`category_id\` IN (${usableCatalogIdsSql(PRODUCT_CATEGORY, companyId)}) THEN \`product\`.\`category_id\` END`;

// ---------------------------------------------------------------------------
// Descripción: por INICIO de palabra (decisión de la web: "ter" no debe
// encontrar "material" ni "500ml" encontrar "1500ML"). Cualquier signo separa
// palabras ("10*26CM" → "26cm"). REGEXP no ignora acentos como LIKE, así que
// cada vocal, la n y la c aceptan sus variantes; las mayúsculas van explícitas
// para no depender del motor (MySQL 8 usa ICU y MariaDB, PCRE).
// ---------------------------------------------------------------------------

const ACCENT_VARIANTS: Record<string, string> = {
  a: "aáàâäã",
  e: "eéèêë",
  i: "iíìîï",
  o: "oóòôöõ",
  u: "uúùûü",
  n: "nñ",
  c: "cç",
};
// Caracteres con significado en una expresión regular: van escapados.
const REGEX_META = /[\\^$.|?*+()[\]{}]/;
const ASCII_LETTER = /^[a-z]$/;

const stripAccents = (text: string): string => text.normalize("NFD").replace(/\p{M}+/gu, "");

const charPattern = (char: string): string => {
  const variants = ACCENT_VARIANTS[char];
  if (variants) return `(${[...variants].flatMap((variant) => [variant, variant.toLocaleUpperCase("es")]).join("|")})`;
  if (ASCII_LETTER.test(char)) return `[${char}${char.toUpperCase()}]`;
  if (REGEX_META.test(char)) return `\\${char}`;
  return char;
};

/** Expresión "alguna de estas formas al inicio de una palabra". */
export const wordStartPattern = (forms: string[]): string => {
  const alternatives = forms.map((form) => [...stripAccents(form.toLocaleLowerCase("es"))].map(charPattern).join(""));
  return `(^|[^[:alnum:]])(${alternatives.join("|")})`;
};

// Campos extra de la búsqueda pública: nombre de la categoría y de la
// subcategoría vigentes (contienen la palabra, igual que el nombre) y la
// descripción (inicio de palabra).
const catalogSearchMatches =
  (companyId: number) =>
  ({ forms }: SearchTerm): WhereOptions<ProductAttributes>[] => [
    { category_id: { [Op.in]: usableCategoryIds(companyId, forms) } },
    {
      [Op.and]: [
        { subcategory_id: { [Op.in]: usableSubcategoryIds(companyId, forms) } },
        // Sin categoría vigente, su subcategoría tampoco se muestra.
        { category_id: { [Op.in]: usableCategoryIds(companyId) } },
      ],
    },
    { description: { [Op.regexp]: wordStartPattern(forms) } },
  ];

export interface PublicCatalogFilter {
  companyId: number;
  search?: string;
  sku?: string;
  code?: string;
  color?: string;
  categoryId?: number;
  subcategoryId?: number;
  withoutCategory?: boolean;
  // Coincidencia exacta (sin distinguir mayúsculas, por la collation).
  skus?: string[];
}

/**
 * Condiciones del catálogo público (se unen con AND). Siempre: empresa de la
 * key y solo productos activos. Los filtros de texto `sku`, `code` y `color`
 * los aplica el listado general de productos.
 */
export function publicCatalogConditions(filter: PublicCatalogFilter): WhereOptions<ProductAttributes>[] {
  const { companyId } = filter;
  // NUNCA productos deshabilitados (pedido explícito del usuario): va como
  // condición fija, no como el filtro de estado de la pantalla, para que
  // ningún parámetro lo pueda abrir.
  const conditions: WhereOptions<ProductAttributes>[] = [{ company_id: companyId }, { is_deleted: false }];

  if (filter.search) conditions.push(...productSearchConditions(filter.search, catalogSearchMatches(companyId)));
  if (filter.skus) conditions.push({ sku: { [Op.in]: filter.skus } });
  // Una categoría deshabilitada no se lista: filtrar por ella no trae nada.
  if (filter.categoryId) {
    conditions.push({ category_id: filter.categoryId }, { category_id: { [Op.in]: usableCategoryIds(companyId) } });
  }
  if (filter.withoutCategory) {
    conditions.push({
      [Op.or]: [{ category_id: null }, { category_id: { [Op.notIn]: usableCategoryIds(companyId) } }],
    });
  }
  return conditions;
}

// ---------------------------------------------------------------------------
// Orden
// ---------------------------------------------------------------------------

export type PublicOrderBy = "name" | "sku" | "price_unit" | "price_hundred" | "category" | "created_at";

/**
 * Orden propio de la API pública (undefined = el orden general de productos,
 * que ya desempata por id).
 *   - price_hundred: sin precio (NULL o 0) siempre al final, en asc y desc.
 *   - category: por nombre de la categoría vigente (no hay campo de orden);
 *     dentro de cada una por SKU; sin categoría al final.
 */
export function publicProductOrder(orderBy: string, orderDir: "asc" | "desc", companyId: number): Order | undefined {
  if (orderBy === "price_hundred") {
    return [
      [literal("(`product`.`price_hundred` IS NULL OR `product`.`price_hundred` <= 0)"), "ASC"],
      ["price_hundred", orderDir],
      ["id", orderDir],
    ];
  }
  if (orderBy !== "category") return undefined;

  const categoryName = `(SELECT gv.name FROM general_variable gv WHERE gv.id = \`product\`.\`category_id\` AND gv.id IN (${usableCatalogIdsSql(PRODUCT_CATEGORY, companyId)}))`;
  return [
    [literal(`${categoryName} IS NULL`), "ASC"],
    [literal(categoryName), orderDir],
    ["sku", "ASC"],
    ["id", "ASC"],
  ];
}

/**
 * De las categorías/subcategorías de una página de productos, cuáles siguen
 * vigentes para la empresa. Una consulta para toda la página.
 */
export async function loadUsableCatalogIds(companyId: number, ids: number[]): Promise<Set<number>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Set();
  const rows = await DataBase.instance.variable_general.findAll({
    where: {
      id: { [Op.in]: unique },
      category: { [Op.in]: [PRODUCT_CATEGORY, PRODUCT_SUBCATEGORY] },
      is_deleted: false,
      company_id: { [Op.or]: [companyId, null] },
    },
    attributes: ["id"],
  });
  return new Set(rows.map((row) => Number(row.id)));
}

import { Op, FindAndCountOptions, Order, WhereOptions, literal } from "sequelize";
import { DataBase } from "../../../../../database";
import { IListOptions } from "../../../../interfaces/IListOptions.interface";
import { ProductAttributes } from "../../model/product.model";
import { buildPaginationMeta, getOffset, PaginatedResult } from "../../../../../core/utils/paginate";
import { buildBusinessDateRange, resolveIsDeletedFilter } from "../../../../../core/utils/listFilters";
import { ProductDto, toProductDtos } from "../shared/product_mapper";
import { productSearchConditions } from "../shared/product_search";

interface ProductListOptions extends IListOptions<ProductAttributes> {
  companyId?: number | null;
  page: number;
  limit: number;
  orderBy: string;
  orderDir: "asc" | "desc";
  // Filtros por columna de la tabla (buscadores del header de DataTable).
  name?: string;
  sku?: string;
  status?: string;
  // Rango de fecha de creación (días de Lima, YYYY-MM-DD).
  dateFrom?: unknown;
  dateTo?: unknown;
  productCategoryId?: number;
  productSubcategoryId?: number;
  // Productos que vienen en un color (el nombre contiene el texto).
  color?: string;
  // Productos con un código de proveedor que contiene el texto.
  code?: string;
  // Orden propio (la API pública ordena por precio o categoría). Sin él, por
  // `orderBy`/`orderDir` con desempate por id.
  // (No se llama `order`: IListOptions ya usa ese nombre con otro tipo.)
  sortOrder?: Order;
}

// Columnas por las que se puede ordenar. `orderBy` llega del query string:
// fuera de esta lista se ordena por fecha de creación.
const SORTABLE_COLUMNS = new Set(["created_at", "name", "sku", "price_unit", "updated_at"]);

// Filtro por color: subconsulta sobre product_color con el valor ESCAPADO
// (nunca interpolado tal cual).
const colorWhere = (color: string | undefined): WhereOptions<ProductAttributes> => {
  if (!color) return {};
  const pattern = DataBase.instance.sequelize.escape(`%${color}%`);
  return { id: { [Op.in]: literal(`(SELECT pc.product_id FROM product_color pc WHERE pc.name LIKE ${pattern})`) } };
};

// Subconsulta "productos con un código de proveedor que contiene el texto",
// con el valor ESCAPADO (nunca interpolado tal cual).
const productIdsWithCode = (text: string) =>
  literal(
    `(SELECT pcode.product_id FROM product_code pcode WHERE pcode.code LIKE ${DataBase.instance.sequelize.escape(`%${text}%`)})`
  );

const getProductsList = async (options: ProductListOptions): Promise<PaginatedResult<ProductDto>> => {
  const { where, page, limit, orderBy, orderDir, companyId, searchTerm, name, sku, status, dateFrom, dateTo } = options;

  // Cada filtro es una condición aparte unida con Op.and. Antes se armaba un
  // solo objeto con 11 spreads condicionales (`cond ? {} : {...}`): TypeScript
  // combinaba todas las variantes y ese objeto tardaba ~80 s en compilarse
  // (ts-node, que revisa archivo por archivo, se quedaba colgado al arrancar).
  // Además, color y código usaban los dos la clave `id` y el último pisaba al
  // primero; con condiciones separadas se aplican ambos.
  const conditions: WhereOptions<ProductAttributes>[] = [];
  if (where) conditions.push(where);
  if (companyId !== null && companyId !== undefined) conditions.push({ company_id: companyId });
  // La búsqueda general cubre nombre, SKU, códigos de proveedores y colores, y
  // entiende plurales y varias palabras (ver product_search.ts).
  if (searchTerm) conditions.push(...productSearchConditions(searchTerm));
  if (options.code) conditions.push({ id: { [Op.in]: productIdsWithCode(options.code) } });
  if (name) conditions.push({ name: { [Op.like]: `%${name}%` } });
  if (sku) conditions.push({ sku: { [Op.like]: `%${sku}%` } });
  const isDeleted = resolveIsDeletedFilter(status);
  if (isDeleted !== undefined) conditions.push({ is_deleted: isDeleted });
  const createdAt = buildBusinessDateRange(dateFrom, dateTo);
  if (createdAt) conditions.push({ created_at: createdAt });
  if (options.productCategoryId) conditions.push({ category_id: options.productCategoryId });
  if (options.productSubcategoryId) conditions.push({ subcategory_id: options.productSubcategoryId });
  if (options.color) conditions.push(colorWhere(options.color));

  // Desempate por id: productos creados en la misma tanda comparten
  // created_at y, sin él, una página podía repetir o saltar productos.
  const defaultOrder: Order = [
    [SORTABLE_COLUMNS.has(orderBy) ? orderBy : "created_at", orderDir],
    ["id", orderDir],
  ];

  const queryOptions: FindAndCountOptions<ProductAttributes> = {
    where: { [Op.and]: conditions },
    order: options.sortOrder ?? defaultOrder,
    limit,
    offset: getOffset(page, limit),
  };

  const { count, rows } = await DataBase.instance.product.findAndCountAll(queryOptions);

  return { data: await toProductDtos(rows), meta: buildPaginationMeta(count, page, limit) };
};

const getProductById = async (id: number) => {
  return DataBase.instance.product.findOne({ where: { id } });
};

export { getProductsList, getProductById };

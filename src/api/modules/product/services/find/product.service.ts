import { Op, FindAndCountOptions } from "sequelize";
import { DataBase } from "../../../../../database";
import { IListOptions } from "../../../../interfaces/IListOptions.interface";
import { ProductAttributes } from "../../model/product.model";
import { buildPaginationMeta, getOffset, PaginatedResult } from "../../../../../core/utils/paginate";

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
}

const getProductsList = async (options: ProductListOptions): Promise<PaginatedResult<ProductAttributes>> => {
  const { where, page, limit, orderBy, orderDir, companyId, searchTerm, name, sku, status } = options;

  const companyWhere = companyId === null || companyId === undefined ? {} : { company_id: companyId };
  const searchWhere = searchTerm
    ? {
        [Op.or]: [{ name: { [Op.like]: `%${searchTerm}%` } }, { sku: { [Op.like]: `%${searchTerm}%` } }],
      }
    : {};
  const nameWhere = name ? { name: { [Op.like]: `%${name}%` } } : {};
  const skuWhere = sku ? { sku: { [Op.like]: `%${sku}%` } } : {};
  const statusWhere = status ? { is_deleted: status === "inactive" } : {};

  const queryOptions: FindAndCountOptions<ProductAttributes> = {
    where: { ...where, ...companyWhere, ...searchWhere, ...nameWhere, ...skuWhere, ...statusWhere },
    order: [[orderBy, orderDir]],
    limit,
    offset: getOffset(page, limit),
  };

  const { count, rows } = await DataBase.instance.product.findAndCountAll(queryOptions);

  return { data: rows, meta: buildPaginationMeta(count, page, limit) };
};

const getProductById = async (id: number) => {
  return DataBase.instance.product.findOne({ where: { id } });
};

export { getProductsList, getProductById };

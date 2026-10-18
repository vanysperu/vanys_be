import { FindAndCountOptions, Op } from "sequelize";
import { DataBase } from "../../../../../database";
import { IListOptions } from "../../../../interfaces/IListOptions.interface";
import { CustomizationTechniqueAttributes } from "../../model/customization_technique.model";
import { buildPaginationMeta, getOffset, PaginatedResult } from "../../../../../core/utils/paginate";
import { buildBusinessDateRange, resolveIsDeletedFilter } from "../../../../../core/utils/listFilters";

interface TechniqueListOptions extends IListOptions<CustomizationTechniqueAttributes> {
  companyId?: number | null;
  page: number;
  limit: number;
  orderBy: string;
  orderDir: "asc" | "desc";
  name?: string;
  status?: string;
  // Rango de fecha de creación (días de Lima, YYYY-MM-DD).
  dateFrom?: unknown;
  dateTo?: unknown;
}

const getTechniquesList = async (
  options: TechniqueListOptions
): Promise<PaginatedResult<CustomizationTechniqueAttributes>> => {
  const { where, page, limit, orderBy, orderDir, companyId, name, status, dateFrom, dateTo } = options;

  const companyWhere = companyId === null || companyId === undefined ? {} : { company_id: companyId };
  const nameWhere = name ? { name: { [Op.like]: `%${name}%` } } : {};
  const isDeleted = resolveIsDeletedFilter(status);
  const statusWhere = isDeleted === undefined ? {} : { is_deleted: isDeleted };
  const createdAt = buildBusinessDateRange(dateFrom, dateTo);
  const dateWhere = createdAt ? { created_at: createdAt } : {};

  const queryOptions: FindAndCountOptions<CustomizationTechniqueAttributes> = {
    where: { ...where, ...companyWhere, ...nameWhere, ...statusWhere, ...dateWhere },
    order: [[orderBy, orderDir]],
    limit,
    offset: getOffset(page, limit),
  };

  const { count, rows } = await DataBase.instance.customization_technique.findAndCountAll(queryOptions);

  return { data: rows, meta: buildPaginationMeta(count, page, limit) };
};

const getTechniqueById = async (id: number) => {
  return DataBase.instance.customization_technique.findOne({ where: { id } });
};

export { getTechniquesList, getTechniqueById };

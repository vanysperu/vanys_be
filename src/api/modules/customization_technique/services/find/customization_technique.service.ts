import { FindAndCountOptions, Op } from "sequelize";
import { DataBase } from "../../../../../database";
import { IListOptions } from "../../../../interfaces/IListOptions.interface";
import { CustomizationTechniqueAttributes } from "../../model/customization_technique.model";
import { buildPaginationMeta, getOffset, PaginatedResult } from "../../../../../core/utils/paginate";

interface TechniqueListOptions extends IListOptions<CustomizationTechniqueAttributes> {
  companyId?: number | null;
  page: number;
  limit: number;
  orderBy: string;
  orderDir: "asc" | "desc";
  name?: string;
  status?: string;
}

const getTechniquesList = async (
  options: TechniqueListOptions
): Promise<PaginatedResult<CustomizationTechniqueAttributes>> => {
  const { where, page, limit, orderBy, orderDir, companyId, name, status } = options;

  const companyWhere = companyId === null || companyId === undefined ? {} : { company_id: companyId };
  const nameWhere = name ? { name: { [Op.like]: `%${name}%` } } : {};
  const statusWhere = status ? { is_deleted: status === "inactive" } : {};

  const queryOptions: FindAndCountOptions<CustomizationTechniqueAttributes> = {
    where: { ...where, ...companyWhere, ...nameWhere, ...statusWhere },
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

import { FindAndCountOptions } from "sequelize";
import { DataBase } from "../../../../../database";
import { IListOptions } from "../../../../interfaces/IListOptions.interface";
import { ResourceAttributes } from "../../models/resource.model";
import { buildPaginationMeta, getOffset, PaginatedResult } from "../../../../../core/utils/paginate";

interface ResourceListOptions extends IListOptions<ResourceAttributes> {
  page: number;
  limit: number;
  orderBy: string;
  orderDir: "asc" | "desc";
}

const getResourcesList = async (options: ResourceListOptions): Promise<PaginatedResult<ResourceAttributes>> => {
  try {
    const { where, page, limit, orderBy, orderDir } = options;

    const queryOptions: FindAndCountOptions<ResourceAttributes> = {
      where: { ...where, active: 1 },
      order: [[orderBy, orderDir]],
      limit,
      offset: getOffset(page, limit),
    };

    const { count, rows } = await DataBase.instance.resource.findAndCountAll(queryOptions);

    return { data: rows, meta: buildPaginationMeta(count, page, limit) };
  } catch (error) {
    throw error;
  }
};

const getResourceById = async (id: number) => {
  try {
    return await DataBase.instance.resource.findOne({ where: { id } });
  } catch (error) {
    throw error;
  }
};

export { getResourcesList, getResourceById };

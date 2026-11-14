import { Op, WhereOptions } from "sequelize";
import { DataBase } from "../../../../../database";
import { buildPaginationMeta, getOffset, PaginatedResult } from "../../../../../core/utils/paginate";
import type { TransportDriverAttributes } from "../../model/dispatch_guide.models";
import type { CatalogListParams, DriverDto } from "../../types/dispatch_guide.types";
import { toDriverDto } from "./driver_shared";

// Columnas por las que se puede ordenar (nunca lo que mande el cliente tal cual).
const SORTABLE = new Set(["last_names", "first_names", "doc_number", "license_number", "created_at", "active"]);

const buildWhere = (params: CatalogListParams): WhereOptions<TransportDriverAttributes> => {
  const conditions: WhereOptions<TransportDriverAttributes>[] = [];
  if (params.companyId !== null) conditions.push({ company_id: params.companyId });
  if (params.status === "active") conditions.push({ active: true });
  if (params.status === "inactive") conditions.push({ active: false });
  const term = params.searchTerm?.trim();
  if (term) {
    conditions.push({
      [Op.or]: [
        { first_names: { [Op.like]: `%${term}%` } },
        { last_names: { [Op.like]: `%${term}%` } },
        { doc_number: { [Op.like]: `%${term}%` } },
        { license_number: { [Op.like]: `%${term}%` } },
      ],
    });
  }
  return { [Op.and]: conditions };
};

// Listado paginado (CLAUDE.md §4): siempre LIMIT/OFFSET en la base.
export const listDriversService = async (params: CatalogListParams): Promise<PaginatedResult<DriverDto>> => {
  const orderBy = SORTABLE.has(params.orderBy) ? params.orderBy : "created_at";
  const { count, rows } = await DataBase.instance.transport_driver.findAndCountAll({
    where: buildWhere(params),
    order: [
      [orderBy, params.orderDir],
      ["id", params.orderDir],
    ],
    limit: params.limit,
    offset: getOffset(params.page, params.limit),
  });
  return { data: rows.map(toDriverDto), meta: buildPaginationMeta(count, params.page, params.limit) };
};

import { Op, WhereOptions } from "sequelize";
import { DataBase } from "../../../../../database";
import { buildPaginationMeta, getOffset, PaginatedResult } from "../../../../../core/utils/paginate";
import type { TransportVehicleAttributes } from "../../model/dispatch_guide.models";
import type { CatalogListParams, VehicleDto } from "../../types/dispatch_guide.types";
import { toVehicleDto } from "./vehicle_shared";

// Columnas por las que se puede ordenar (nunca lo que mande el cliente tal cual).
const SORTABLE = new Set(["plate", "description", "created_at", "active"]);

const buildWhere = (params: CatalogListParams): WhereOptions<TransportVehicleAttributes> => {
  const conditions: WhereOptions<TransportVehicleAttributes>[] = [];
  if (params.companyId !== null) conditions.push({ company_id: params.companyId });
  if (params.status === "active") conditions.push({ active: true });
  if (params.status === "inactive") conditions.push({ active: false });
  const term = params.searchTerm?.trim();
  if (term) {
    conditions.push({ [Op.or]: [{ plate: { [Op.like]: `%${term}%` } }, { description: { [Op.like]: `%${term}%` } }] });
  }
  return { [Op.and]: conditions };
};

// Listado paginado (CLAUDE.md §4): siempre LIMIT/OFFSET en la base.
export const listVehiclesService = async (params: CatalogListParams): Promise<PaginatedResult<VehicleDto>> => {
  const orderBy = SORTABLE.has(params.orderBy) ? params.orderBy : "created_at";
  const { count, rows } = await DataBase.instance.transport_vehicle.findAndCountAll({
    where: buildWhere(params),
    order: [
      [orderBy, params.orderDir],
      ["id", params.orderDir],
    ],
    limit: params.limit,
    offset: getOffset(params.page, params.limit),
  });
  return { data: rows.map(toVehicleDto), meta: buildPaginationMeta(count, params.page, params.limit) };
};

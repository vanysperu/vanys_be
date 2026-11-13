import { Op, WhereOptions } from "sequelize";
import { DataBase } from "../../../../../database";
import { IToken } from "../../../../interfaces/IToken.interface";
import { buildPaginationMeta, getOffset, PaginatedResult } from "../../../../../core/utils/paginate";
import type { WarehouseAttributes } from "../../model/inventory.models";
import type { WarehouseDto } from "../../types/inventory.types";
import { toWarehouseDtos } from "./warehouse_shared";

// Almacenes de la empresa (sin el virtual de tránsito), paginados. Un usuario
// atado a una tienda sin "ver todas las tiendas" ve solo los suyos.
export const listWarehousesService = async (
  params: { companyId: number; page: number; limit: number; onlyActive?: boolean; businessUnitId?: number },
  user: IToken
): Promise<PaginatedResult<WarehouseDto>> => {
  const conditions: WhereOptions<WarehouseAttributes>[] = [{ company_id: params.companyId, is_transit: false }];
  if (params.onlyActive) conditions.push({ active: true });
  if (params.businessUnitId) conditions.push({ business_unit_id: params.businessUnitId });
  if (!user.isSystem && user.businessUnitId && !user.canViewAllBusinessUnits) conditions.push({ business_unit_id: user.businessUnitId });

  const { count, rows } = await DataBase.instance.warehouse.findAndCountAll({
    where: { [Op.and]: conditions },
    order: [
      ["business_unit_id", "ASC"],
      ["is_default", "DESC"],
      ["name", "ASC"],
    ],
    limit: params.limit,
    offset: getOffset(params.page, params.limit),
  });
  return { data: await toWarehouseDtos(rows), meta: buildPaginationMeta(count, params.page, params.limit) };
};

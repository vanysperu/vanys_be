import { Op, WhereOptions } from "sequelize";
import { DataBase } from "../../../../../database";
import { buildPaginationMeta, getOffset, PaginatedResult } from "../../../../../core/utils/paginate";
import type { SupplierStockSourceAttributes } from "../../model/supplier_stock.models";
import type { StockSourceDto } from "../../types/supplier_stock.types";
import { toSourceDtos } from "../shared/source_shared";

interface ListSourcesParams {
  companyId: number | null;
  page: number;
  limit: number;
  orderDir: "asc" | "desc";
  status?: "active" | "inactive";
}

// Fuentes de stock de la empresa, paginadas (CLAUDE.md §4).
export const listSourcesService = async (params: ListSourcesParams): Promise<PaginatedResult<StockSourceDto>> => {
  const conditions: WhereOptions<SupplierStockSourceAttributes>[] = [];
  if (params.companyId !== null) conditions.push({ company_id: params.companyId });
  if (params.status === "active") conditions.push({ active: true });
  if (params.status === "inactive") conditions.push({ active: false });

  const { count, rows } = await DataBase.instance.supplier_stock_source.findAndCountAll({
    where: { [Op.and]: conditions },
    order: [
      ["created_at", params.orderDir],
      ["id", params.orderDir],
    ],
    limit: params.limit,
    offset: getOffset(params.page, params.limit),
  });
  return { data: await toSourceDtos(rows), meta: buildPaginationMeta(count, params.page, params.limit) };
};

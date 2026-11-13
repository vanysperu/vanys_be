import { Op, WhereOptions } from "sequelize";
import { DataBase } from "../../../../database";
import { buildPaginationMeta, getOffset, PaginatedResult } from "../../../../core/utils/paginate";
import type { SupplierAttributes } from "../model/supplier.model";
import type { ListSuppliersParams, SupplierDto } from "../types/supplier.types";
import { toSupplierDto } from "./shared/supplier_shared";

// Columnas por las que se puede ordenar (nunca lo que mande el cliente tal cual).
const SORTABLE = new Set(["name", "document_number", "created_at", "active"]);

const buildWhere = (params: ListSuppliersParams): WhereOptions<SupplierAttributes> => {
  const conditions: WhereOptions<SupplierAttributes>[] = [];
  if (params.companyId !== null) conditions.push({ company_id: params.companyId });
  if (params.status === "active") conditions.push({ active: true });
  if (params.status === "inactive") conditions.push({ active: false });

  const term = params.searchTerm?.trim();
  if (term) {
    conditions.push({
      [Op.or]: [
        { name: { [Op.like]: `%${term}%` } },
        { trade_name: { [Op.like]: `%${term}%` } },
        { document_number: { [Op.like]: `%${term}%` } },
      ],
    });
  }
  return { [Op.and]: conditions };
};

// Listado paginado (CLAUDE.md §4): siempre LIMIT/OFFSET en la base.
export const listSuppliersService = async (params: ListSuppliersParams): Promise<PaginatedResult<SupplierDto>> => {
  const orderBy = SORTABLE.has(params.orderBy) ? params.orderBy : "created_at";
  const { count, rows } = await DataBase.instance.supplier.findAndCountAll({
    where: buildWhere(params),
    order: [
      [orderBy, params.orderDir],
      ["id", params.orderDir],
    ],
    limit: params.limit,
    offset: getOffset(params.page, params.limit),
  });
  return { data: rows.map(toSupplierDto), meta: buildPaginationMeta(count, params.page, params.limit) };
};

import { DataBase } from "../../../../../database";
import { buildPaginationMeta, getOffset, PaginatedResult } from "../../../../../core/utils/paginate";

export interface StoreInventorySettings {
  id: number;
  code: string | null;
  inventory_enabled: boolean;
  inventory_exit_on: "delivered" | "dispatch_guide";
}

// Tiendas de la empresa con su configuración de inventario (plan §8.1, D4).
export const listStoresService = async (companyId: number, page: number, limit: number): Promise<PaginatedResult<StoreInventorySettings>> => {
  const { count, rows } = await DataBase.instance.business_unit.findAndCountAll({
    where: { company_id: companyId, is_deleted: false },
    attributes: ["id", "business_code", "inventory_enabled", "inventory_exit_on"],
    order: [["id", "ASC"]],
    limit,
    offset: getOffset(page, limit),
  });
  return {
    data: rows.map((store) => ({
      id: Number(store.id),
      code: store.business_code ?? null,
      inventory_enabled: Boolean(store.inventory_enabled),
      inventory_exit_on: store.inventory_exit_on ?? "delivered",
    })),
    meta: buildPaginationMeta(count, page, limit),
  };
};

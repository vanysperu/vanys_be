import { Op, QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";
import { IToken } from "../../../../interfaces/IToken.interface";
import { buildPaginationMeta, getOffset, PaginatedResult } from "../../../../../core/utils/paginate";
import { canSeeCosts } from "../documents/document_shared";
import { readableWarehouses } from "./readable_warehouses";

export interface StockRow {
  productId: number;
  productName: string;
  sku: string | null;
  color: string;
  byWarehouse: { warehouseId: number; warehouseName: string; quantity: number }[];
  total: number;
  // Solo con "Ver costos": promedio ponderado de la empresa (D3).
  avgCost: number | null;
}

// Stock actual por producto y color: una columna por almacén y el total
// (consolidado). Paginado por producto/color en la base (CLAUDE.md §4).
export const listStockService = async (
  params: { companyId: number; page: number; limit: number; warehouseId?: number; searchTerm?: string; includeZero?: boolean },
  user: IToken
): Promise<PaginatedResult<StockRow>> => {
  const warehouses = (await readableWarehouses(params.companyId, user, true)).filter(
    (warehouse) => !params.warehouseId || Number(warehouse.id) === params.warehouseId
  );
  if (warehouses.length === 0) return { data: [], meta: buildPaginationMeta(0, params.page, params.limit) };

  const replacements = {
    companyId: params.companyId,
    warehouseIds: warehouses.map((warehouse) => Number(warehouse.id)),
    search: params.searchTerm?.trim() ? `%${params.searchTerm.trim()}%` : null,
    limit: params.limit,
    offset: getOffset(params.page, params.limit),
  };
  const filter = `
    FROM stock_balance b
    INNER JOIN product p ON p.id = b.product_id
    WHERE b.company_id = :companyId AND b.warehouse_id IN (:warehouseIds)
      AND (:search IS NULL OR p.name LIKE :search OR p.sku LIKE :search)`;
  const having = params.includeZero ? "" : "HAVING SUM(b.on_hand) <> 0";

  const [countRow] = (await DataBase.instance.sequelize.query(
    `SELECT COUNT(*) AS total FROM (SELECT b.product_id, b.color_key ${filter} GROUP BY b.product_id, b.color_key ${having}) t`,
    { type: QueryTypes.SELECT, replacements }
  )) as { total: number | string }[];
  const page = (await DataBase.instance.sequelize.query(
    `SELECT b.product_id, b.color_key, MAX(p.name) AS name, MAX(p.sku) AS sku, SUM(b.on_hand) AS total
     ${filter} GROUP BY b.product_id, b.color_key ${having}
     ORDER BY MAX(p.name) ASC, b.color_key ASC LIMIT :limit OFFSET :offset`,
    { type: QueryTypes.SELECT, replacements }
  )) as { product_id: number; color_key: string; name: string; sku: string | null; total: string }[];
  if (page.length === 0) return { data: [], meta: buildPaginationMeta(Number(countRow?.total ?? 0), params.page, params.limit) };

  const pairs = page.map((row) => ({ product_id: row.product_id, color_key: row.color_key }));
  const [details, costs] = await Promise.all([
    DataBase.instance.stock_balance.findAll({
      where: { warehouse_id: { [Op.in]: replacements.warehouseIds }, [Op.or]: pairs },
      attributes: ["warehouse_id", "product_id", "color_key", "on_hand"],
    }),
    canSeeCosts(user)
      ? DataBase.instance.stock_cost.findAll({ where: { company_id: params.companyId, [Op.or]: pairs }, attributes: ["product_id", "color_key", "avg_cost"] })
      : Promise.resolve([]),
  ]);
  const warehouseName = new Map(warehouses.map((warehouse) => [Number(warehouse.id), warehouse.name]));

  const data = page.map((row) => {
    const byWarehouse = new Map<number, number>();
    for (const detail of details) {
      if (Number(detail.product_id) !== Number(row.product_id) || detail.color_key !== row.color_key) continue;
      byWarehouse.set(Number(detail.warehouse_id), (byWarehouse.get(Number(detail.warehouse_id)) ?? 0) + Number(detail.on_hand));
    }
    const cost = costs.find((entry) => Number(entry.product_id) === Number(row.product_id) && entry.color_key === row.color_key);
    return {
      productId: Number(row.product_id),
      productName: row.name,
      sku: row.sku,
      color: row.color_key,
      byWarehouse: [...byWarehouse.entries()]
        .filter(([, quantity]) => quantity !== 0)
        .map(([warehouseId, quantity]) => ({ warehouseId, warehouseName: warehouseName.get(warehouseId) ?? "", quantity })),
      total: Number(row.total),
      avgCost: cost ? Number(cost.avg_cost) : null,
    };
  });
  return { data, meta: buildPaginationMeta(Number(countRow?.total ?? 0), params.page, params.limit) };
};

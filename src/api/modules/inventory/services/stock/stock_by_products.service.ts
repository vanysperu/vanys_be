import { Op } from "sequelize";
import { DataBase } from "../../../../../database";
import { IToken } from "../../../../interfaces/IToken.interface";
import { readableWarehouses } from "./readable_warehouses";

export const MAX_STOCK_PRODUCTS = 100;

export interface OwnStockLookup {
  productId: number;
  byWarehouse: { warehouseId: number; warehouseName: string; color: string; quantity: number }[];
  total: number;
}

// Stock propio de varios productos en UNA llamada (para Nueva cotización,
// junto al de proveedores, plan §8.4). Solo almacenes que el usuario ve.
export const stockByProductsService = async (companyId: number, productIds: number[], user: IToken): Promise<OwnStockLookup[]> => {
  const ids = [...new Set(productIds)].slice(0, MAX_STOCK_PRODUCTS);
  const warehouses = (await readableWarehouses(companyId, user)).filter((warehouse) => warehouse.active);
  if (ids.length === 0 || warehouses.length === 0) return ids.map((productId) => ({ productId, byWarehouse: [], total: 0 }));

  const balances = await DataBase.instance.stock_balance.findAll({
    where: { company_id: companyId, product_id: { [Op.in]: ids }, warehouse_id: { [Op.in]: warehouses.map((warehouse) => warehouse.id) }, on_hand: { [Op.ne]: 0 } },
    attributes: ["warehouse_id", "product_id", "color_key", "on_hand"],
  });
  const warehouseName = new Map(warehouses.map((warehouse) => [Number(warehouse.id), warehouse.name]));
  return ids.map((productId) => {
    const grouped = new Map<string, { warehouseId: number; color: string; quantity: number }>();
    for (const balance of balances.filter((row) => Number(row.product_id) === productId)) {
      const key = `${balance.warehouse_id}|${balance.color_key}`;
      const current = grouped.get(key) ?? { warehouseId: Number(balance.warehouse_id), color: balance.color_key, quantity: 0 };
      grouped.set(key, { ...current, quantity: current.quantity + Number(balance.on_hand) });
    }
    const byWarehouse = [...grouped.values()].map((entry) => ({ ...entry, warehouseName: warehouseName.get(entry.warehouseId) ?? "" }));
    return { productId, byWarehouse, total: byWarehouse.reduce((sum, entry) => sum + entry.quantity, 0) };
  });
};

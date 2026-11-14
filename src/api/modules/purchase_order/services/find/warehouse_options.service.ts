import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { IToken } from "../../../../interfaces/IToken.interface";
import { hasCompanyFeature } from "../../../company_feature/services/shared/feature_store";
import { canWriteWarehouse } from "../../../inventory/services/shared/inventory_shared";

interface ItemRow {
  company_id: number | string;
  business_unit_id: number | string | null;
  store_inventory_enabled: number | boolean | null;
  product_id: number | string;
  product_name: string;
  tracks_stock: number | boolean;
  is_perishable: number | boolean;
}

export interface PurchaseWarehouseOption {
  id: number;
  code: string;
  name: string;
  business_unit_id: number | null;
  business_unit_name: string | null;
  is_default: boolean;
  // Con lotes: el lote se genera si no se escribe; con vencimiento y producto
  // perecible, la fecha de vencimiento es obligatoria.
  track_lots: boolean;
  requires_expiry: boolean;
}

export interface PurchaseWarehouseOptions {
  // false = no se ofrece "Ingresar al almacén" (y `reason` dice por qué).
  available: boolean;
  reason: "inventory_disabled" | "product_without_stock" | "no_warehouses" | null;
  product_name: string;
  // Almacén preseleccionado: el predeterminado de la tienda de la cotización,
  // si esa tienda usa almacén. null = "No ingresar".
  suggested_warehouse_id: number | null;
  warehouses: PurchaseWarehouseOption[];
}

interface WarehouseRow {
  id: number | string;
  company_id: number | string;
  code: string;
  name: string;
  business_unit_id: number | string | null;
  business_unit_name: string | null;
  is_default: number | boolean;
  track_lots: number | boolean;
  track_expiry: number | boolean;
}

/**
 * Almacenes a los que puede ingresar la compra de un item (plan §8.4, "Ingresar
 * al almacén X"): los activos de la empresa que el usuario opera (un usuario de
 * tienda, solo los de su tienda), con los de la tienda de la cotización
 * primero. Se ofrece solo si la empresa tiene inventario y el producto maneja
 * stock. Quien llama ya validó que puede tocar el item.
 */
export async function getPurchaseWarehouseOptionsService(itemId: number, user: IToken): Promise<PurchaseWarehouseOptions> {
  const [item] = (await DataBase.instance.sequelize.query(
    `SELECT po.company_id, q.business_unit_id, bu.inventory_enabled AS store_inventory_enabled,
            pr.id AS product_id, pr.name AS product_name, pr.tracks_stock, pr.is_perishable
     FROM purchase_order_item poi
     INNER JOIN purchase_order po ON po.id = poi.purchase_order_id
     INNER JOIN quotation q ON q.id = po.quotation_id
     INNER JOIN quotation_item qi ON qi.id = poi.quotation_item_id
     INNER JOIN product pr ON pr.id = qi.product_id
     LEFT JOIN business_unit bu ON bu.id = q.business_unit_id
     WHERE poi.id = :itemId`,
    { type: QueryTypes.SELECT, replacements: { itemId } }
  )) as ItemRow[];
  if (!item) throw new AppError(404, "El item no existe");

  const companyId = Number(item.company_id);
  const unavailable = (reason: PurchaseWarehouseOptions["reason"]): PurchaseWarehouseOptions => ({
    available: false,
    reason,
    product_name: item.product_name,
    suggested_warehouse_id: null,
    warehouses: [],
  });
  if (!(await hasCompanyFeature(companyId, "inventory"))) return unavailable("inventory_disabled");
  if (!item.tracks_stock) return unavailable("product_without_stock");

  const storeId = item.business_unit_id === null ? null : Number(item.business_unit_id);
  const rows = (await DataBase.instance.sequelize.query(
    `SELECT w.id, w.company_id, w.code, w.name, w.business_unit_id, bu.business_code AS business_unit_name,
            w.is_default, w.track_lots, w.track_expiry
     FROM warehouse w
     LEFT JOIN business_unit bu ON bu.id = w.business_unit_id
     WHERE w.company_id = :companyId AND w.is_transit = false AND w.active = true
     ORDER BY (w.business_unit_id <=> :storeId) DESC, w.is_default DESC, w.name ASC
     LIMIT 100`,
    { type: QueryTypes.SELECT, replacements: { companyId, storeId } }
  )) as WarehouseRow[];

  // Mismo alcance de escritura que el resto del inventario (canWriteWarehouse).
  const writable = rows.filter((row) =>
    canWriteWarehouse(user, { company_id: Number(row.company_id), business_unit_id: row.business_unit_id === null ? null : Number(row.business_unit_id) })
  );
  if (writable.length === 0) return unavailable("no_warehouses");

  const warehouses = writable.map((row) => ({
    id: Number(row.id),
    code: row.code,
    name: row.name,
    business_unit_id: row.business_unit_id === null ? null : Number(row.business_unit_id),
    business_unit_name: row.business_unit_name,
    is_default: Boolean(row.is_default),
    track_lots: Boolean(row.track_lots),
    requires_expiry: Boolean(row.track_lots) && Boolean(row.track_expiry) && Boolean(item.is_perishable),
  }));
  const storeDefault = warehouses.find((warehouse) => warehouse.business_unit_id === storeId && warehouse.is_default)
    ?? warehouses.find((warehouse) => warehouse.business_unit_id === storeId);
  const suggested = item.store_inventory_enabled ? (storeDefault?.id ?? null) : null;

  return { available: true, reason: null, product_name: item.product_name, suggested_warehouse_id: suggested, warehouses };
}

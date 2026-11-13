import { Op, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import type { WarehouseModel } from "../../model/inventory.models";
import type { WarehouseDto, WarehouseInput } from "../../types/inventory.types";

// Reglas de configuración de un almacén (plan §8.2).
export const assertWarehouseRules = (input: WarehouseInput) => {
  // D5: un lote en negativo no tiene sentido (ERPNext lo prohíbe desde la v15).
  if (input.track_lots && input.allow_negative_stock) {
    throw new AppError(400, "Un almacén con lotes no puede permitir stock negativo", undefined, "LOTS_AND_NEGATIVE");
  }
  if (input.track_expiry && !input.track_lots) throw new AppError(400, "Para controlar vencimientos, el almacén tiene que controlar lotes");
};

export const assertStoreInCompany = async (businessUnitId: number, companyId: number, transaction?: Transaction) => {
  const store = await DataBase.instance.business_unit.findOne({ where: { id: businessUnitId, company_id: companyId }, attributes: ["id"], transaction });
  if (!store) throw new AppError(400, "La tienda no es de esta empresa");
};

// Un solo almacén predeterminado por tienda (de ahí salen las ventas).
export const unsetOtherDefaults = async (warehouse: WarehouseModel, transaction: Transaction) => {
  await DataBase.instance.warehouse.update(
    { is_default: false },
    { where: { business_unit_id: warehouse.business_unit_id, id: { [Op.ne]: warehouse.id }, is_default: true }, transaction }
  );
};

export const warehouseHasStock = async (warehouseId: number, transaction?: Transaction): Promise<boolean> =>
  (await DataBase.instance.stock_balance.findOne({ where: { warehouse_id: warehouseId, on_hand: { [Op.ne]: 0 } }, attributes: ["id"], transaction })) !== null;

export const toWarehouseDtos = async (warehouses: WarehouseModel[]): Promise<WarehouseDto[]> => {
  const storeIds = [...new Set(warehouses.flatMap((warehouse) => (warehouse.business_unit_id ? [Number(warehouse.business_unit_id)] : [])))];
  const stores = storeIds.length
    ? await DataBase.instance.business_unit.findAll({ where: { id: { [Op.in]: storeIds } }, attributes: ["id", "business_code"] })
    : [];
  const storeName = new Map(stores.map((store) => [Number(store.id), store.business_code ?? null]));
  return warehouses.map((warehouse) => ({
    id: Number(warehouse.id),
    company_id: Number(warehouse.company_id),
    business_unit_id: Number(warehouse.business_unit_id),
    businessUnitName: storeName.get(Number(warehouse.business_unit_id)) ?? null,
    code: warehouse.code,
    name: warehouse.name,
    address: warehouse.address,
    ubigeo: warehouse.ubigeo,
    sunat_establishment_code: warehouse.sunat_establishment_code,
    allow_negative_stock: Boolean(warehouse.allow_negative_stock),
    track_lots: Boolean(warehouse.track_lots),
    track_expiry: Boolean(warehouse.track_expiry),
    expiry_alert_days: warehouse.expiry_alert_days,
    block_expired: Boolean(warehouse.block_expired),
    is_default: Boolean(warehouse.is_default),
    active: Boolean(warehouse.active),
  }));
};

export const cleanWarehouseInput = (input: WarehouseInput) => ({
  business_unit_id: input.business_unit_id,
  code: input.code.trim().toUpperCase(),
  name: input.name.trim(),
  address: input.address?.trim() || null,
  ubigeo: input.ubigeo?.trim() || null,
  sunat_establishment_code: input.sunat_establishment_code?.trim() || null,
  allow_negative_stock: input.allow_negative_stock,
  track_lots: input.track_lots,
  track_expiry: input.track_expiry,
  expiry_alert_days: input.expiry_alert_days,
  block_expired: input.block_expired,
});

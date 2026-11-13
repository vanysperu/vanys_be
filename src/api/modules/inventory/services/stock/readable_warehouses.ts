import { Op } from "sequelize";
import { DataBase } from "../../../../../database";
import { IToken } from "../../../../interfaces/IToken.interface";
import type { WarehouseModel } from "../../model/inventory.models";
import { canReadWarehouse } from "../shared/inventory_shared";

// Almacenes que el usuario puede consultar (sin el de tránsito salvo que se pida).
export const readableWarehouses = async (companyId: number, user: IToken, includeTransit = false): Promise<WarehouseModel[]> => {
  const warehouses = await DataBase.instance.warehouse.findAll({
    where: { company_id: companyId, ...(includeTransit ? {} : { is_transit: false }) },
    order: [["name", "ASC"]],
  });
  return warehouses.filter((warehouse) => canReadWarehouse(user, warehouse));
};

export const idsOf = (warehouses: WarehouseModel[]) => ({ [Op.in]: warehouses.map((warehouse) => Number(warehouse.id)) });

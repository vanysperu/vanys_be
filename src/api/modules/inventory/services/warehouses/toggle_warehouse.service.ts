import { Op } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { IToken } from "../../../../interfaces/IToken.interface";
import { nowUtc } from "../../../../../utils/dateUtils";
import { findWarehouseForCaller } from "../shared/inventory_shared";
import type { WarehouseDto } from "../../types/inventory.types";
import { toWarehouseDtos, warehouseHasStock } from "./warehouse_shared";

// Deshabilitar / habilitar (plan §8.1): no se deshabilita con stock distinto
// de 0 ni con transferencias abiertas (en tránsito hacia o desde él).
export const toggleWarehouseService = async (id: number, user: IToken): Promise<WarehouseDto> => {
  const warehouse = await findWarehouseForCaller(id, user, "write");
  if (warehouse.active) {
    if (await warehouseHasStock(Number(warehouse.id))) {
      throw new AppError(409, "El almacén tiene stock: sácalo o transfiérelo antes de deshabilitarlo", undefined, "WAREHOUSE_HAS_STOCK");
    }
    const openTransfer = await DataBase.instance.stock_document.findOne({
      where: {
        doc_type: "transfer",
        status: { [Op.in]: ["dispatched", "partially_received"] },
        [Op.or]: [{ warehouse_id: warehouse.id }, { target_warehouse_id: warehouse.id }],
      },
      attributes: ["id"],
    });
    if (openTransfer) throw new AppError(409, "El almacén tiene transferencias en tránsito", undefined, "WAREHOUSE_OPEN_TRANSFERS");
  }
  await warehouse.update({ active: !warehouse.active, is_default: warehouse.active ? false : warehouse.is_default, updated_by: user.userId, updated_at: nowUtc() });
  const [dto] = await toWarehouseDtos([warehouse]);
  return dto as WarehouseDto;
};

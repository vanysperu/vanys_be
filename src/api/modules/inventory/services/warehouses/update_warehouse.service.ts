import { UniqueConstraintError } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { IToken } from "../../../../interfaces/IToken.interface";
import { nowUtc } from "../../../../../utils/dateUtils";
import { findWarehouseForCaller } from "../shared/inventory_shared";
import type { WarehouseDto, WarehouseInput } from "../../types/inventory.types";
import { assertStoreInCompany, assertWarehouseRules, cleanWarehouseInput, toWarehouseDtos, unsetOtherDefaults, warehouseHasStock } from "./warehouse_shared";

// Edita un almacén. Con stock, no cambia de tienda ni de control de lotes
// (los saldos por lote quedarían inconsistentes).
export const updateWarehouseService = async (id: number, input: WarehouseInput, user: IToken): Promise<WarehouseDto> => {
  assertWarehouseRules(input);
  try {
    const warehouse = await DataBase.instance.sequelize.transaction(async (transaction) => {
      const warehouse = await findWarehouseForCaller(id, user, "write", transaction);
      const changesStore = Number(input.business_unit_id) !== Number(warehouse.business_unit_id);
      const changesLots = input.track_lots !== Boolean(warehouse.track_lots);
      if ((changesStore || changesLots) && (await warehouseHasStock(Number(warehouse.id), transaction))) {
        throw new AppError(409, "Con stock no se puede cambiar la tienda ni el control de lotes del almacén", undefined, "WAREHOUSE_HAS_STOCK");
      }
      if (changesStore) await assertStoreInCompany(input.business_unit_id, Number(warehouse.company_id), transaction);
      await warehouse.update({ ...cleanWarehouseInput(input), is_default: input.is_default, updated_by: user.userId, updated_at: nowUtc() }, { transaction });
      if (warehouse.is_default) await unsetOtherDefaults(warehouse, transaction);
      return warehouse;
    });
    const [dto] = await toWarehouseDtos([warehouse]);
    return dto as WarehouseDto;
  } catch (error: unknown) {
    if (error instanceof UniqueConstraintError) throw new AppError(409, "Ya hay un almacén con ese código", undefined, "WAREHOUSE_CODE_TAKEN");
    throw error;
  }
};

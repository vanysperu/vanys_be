import { UniqueConstraintError } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { IToken } from "../../../../interfaces/IToken.interface";
import { nowUtc } from "../../../../../utils/dateUtils";
import { assertCompanyHasInventory, canWriteWarehouse } from "../shared/inventory_shared";
import type { WarehouseDto, WarehouseInput } from "../../types/inventory.types";
import { assertStoreInCompany, assertWarehouseRules, cleanWarehouseInput, toWarehouseDtos, unsetOtherDefaults } from "./warehouse_shared";

// Crea un almacén en una tienda de la empresa. El primero de la tienda queda
// como predeterminado.
export const createWarehouseService = async (companyId: number, input: WarehouseInput, user: IToken): Promise<WarehouseDto> => {
  await assertCompanyHasInventory(companyId);
  assertWarehouseRules(input);
  if (!canWriteWarehouse(user, { company_id: companyId, business_unit_id: input.business_unit_id })) {
    throw new AppError(403, "Solo puedes crear almacenes en tu tienda");
  }
  try {
    const warehouse = await DataBase.instance.sequelize.transaction(async (transaction) => {
      await assertStoreInCompany(input.business_unit_id, companyId, transaction);
      const others = await DataBase.instance.warehouse.count({ where: { business_unit_id: input.business_unit_id, active: true }, transaction });
      const now = nowUtc();
      const created = await DataBase.instance.warehouse.create(
        {
          id: 0,
          company_id: companyId,
          ...cleanWarehouseInput(input),
          is_default: input.is_default || others === 0,
          is_transit: false,
          active: true,
          created_by: user.userId,
          created_at: now,
          updated_by: user.userId,
          updated_at: now,
        },
        { transaction }
      );
      if (created.is_default) await unsetOtherDefaults(created, transaction);
      return created;
    });
    const [dto] = await toWarehouseDtos([warehouse]);
    return dto as WarehouseDto;
  } catch (error: unknown) {
    if (error instanceof UniqueConstraintError) throw new AppError(409, "Ya hay un almacén con ese código", undefined, "WAREHOUSE_CODE_TAKEN");
    throw error;
  }
};

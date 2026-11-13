import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { IToken } from "../../../../interfaces/IToken.interface";
import { nowUtc } from "../../../../../utils/dateUtils";
import type { StoreInventorySettings } from "./list_stores.service";

// "Usa almacén" y cuándo una venta descuenta el stock (D4: al marcar
// Entregada o al emitir la guía de remisión).
export const updateStoreSettingsService = async (
  storeId: number,
  input: { inventory_enabled: boolean; inventory_exit_on: "delivered" | "dispatch_guide" },
  user: IToken
): Promise<StoreInventorySettings> => {
  const store = await DataBase.instance.business_unit.findByPk(storeId);
  if (!store || (!user.isSystem && Number(store.company_id) !== user.companyId)) throw new AppError(404, "La tienda no existe");
  if (!user.isSystem && user.businessUnitId && Number(store.id) !== user.businessUnitId) throw new AppError(403, "Solo puedes configurar tu tienda");
  await store.update({ ...input, updated_by: user.userId, updated_at: nowUtc() });
  return { id: Number(store.id), code: store.business_code ?? null, inventory_enabled: input.inventory_enabled, inventory_exit_on: input.inventory_exit_on };
};

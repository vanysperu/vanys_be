import { nowUtc } from "../../../../utils/dateUtils";
import { IToken } from "../../../interfaces/IToken.interface";
import { findSupplierForCaller, toSupplierDto } from "./shared/supplier_shared";
import type { SupplierDto } from "../types/supplier.types";

// Deshabilitar / habilitar (soft-delete, CLAUDE.md §1). Un proveedor
// deshabilitado deja de ofrecerse en los selectores; sus códigos y su
// historial se conservan.
export const toggleSupplierStatusService = async (id: number, user: IToken): Promise<SupplierDto> => {
  const supplier = await findSupplierForCaller(id, user);
  await supplier.update({ active: !supplier.active, updated_by: user.userId, updated_at: nowUtc() });
  return toSupplierDto(supplier);
};

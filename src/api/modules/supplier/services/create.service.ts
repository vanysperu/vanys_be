import { DataBase } from "../../../../database";
import { nowUtc } from "../../../../utils/dateUtils";
import { cleanSupplierInput, rethrowSupplierDuplicate, toSupplierDto } from "./shared/supplier_shared";
import type { SupplierDto, SupplierInput } from "../types/supplier.types";

// La empresa ya viene resuelta por el controller (la del usuario, o la que
// eligió el Super Administrador).
export const createSupplierService = async (companyId: number, input: SupplierInput, actorId: number): Promise<SupplierDto> => {
  const now = nowUtc();
  try {
    const supplier = await DataBase.instance.supplier.create({
      id: 0,
      company_id: companyId,
      ...cleanSupplierInput(input),
      active: true,
      created_by: actorId,
      created_at: now,
      updated_by: actorId,
      updated_at: now,
    });
    return toSupplierDto(supplier);
  } catch (error: unknown) {
    return rethrowSupplierDuplicate(error);
  }
};

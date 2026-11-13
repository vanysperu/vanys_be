import { DataBase } from "../../../../database";
import { nowUtc } from "../../../../utils/dateUtils";
import { IToken } from "../../../interfaces/IToken.interface";
import { cleanSupplierInput, findSupplierForCaller, rethrowSupplierDuplicate, toSupplierDto } from "./shared/supplier_shared";
import type { SupplierDto, SupplierInput } from "../types/supplier.types";

// Editar un proveedor. Su nombre se copia en los códigos de producto que lo
// usan (product_code.supplier), así la ficha del producto muestra el nombre
// nuevo: todo en una transacción.
export const updateSupplierService = async (id: number, input: SupplierInput, user: IToken): Promise<SupplierDto> => {
  try {
    return await DataBase.instance.sequelize.transaction(async (transaction) => {
      const supplier = await findSupplierForCaller(id, user, transaction);
      const values = cleanSupplierInput(input);
      const now = nowUtc();
      await supplier.update({ ...values, updated_by: user.userId, updated_at: now }, { transaction });

      await DataBase.instance.product_code.update(
        { supplier: values.name, updated_by: user.userId, updated_at: now },
        { where: { supplier_id: supplier.id }, transaction }
      );
      return toSupplierDto(supplier);
    });
  } catch (error: unknown) {
    return rethrowSupplierDuplicate(error);
  }
};

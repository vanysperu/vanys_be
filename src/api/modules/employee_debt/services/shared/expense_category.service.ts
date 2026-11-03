import { Op, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";

// Categorías de gasto válidas para una deuda manual: el catálogo de Caja
// (cash_movement_type), global o de la empresa, activo. Así una deuda manual
// se filtra y agrupa igual que cualquier egreso. El catálogo no guarda el
// sentido: estas dos son de ingreso y no aplican a una deuda (es un gasto).
const INCOME_ONLY_CATEGORIES = ["otro_ingreso", "aporte_capital"];

// Misma regla al registrar y al corregir una deuda manual (al corregir, solo
// si la categoría cambió: conservar una que se deshabilitó después no bloquea
// corregir, por ejemplo, el monto).
export const assertExpenseCategory = async (
  category: string,
  companyId: number,
  transaction?: Transaction
): Promise<void> => {
  if (INCOME_ONLY_CATEGORIES.includes(category)) {
    throw new AppError(400, "Esa categoría es de ingreso: elige una categoría de gasto");
  }
  const found = await DataBase.instance.variable_general.findOne({
    where: {
      category: "cash_movement_type",
      prefix_id: category,
      is_deleted: false,
      company_id: { [Op.or]: [companyId, null] },
    },
    transaction,
  });
  if (!found) throw new AppError(400, "La categoría seleccionada no existe o está deshabilitada");
};

import { literal } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { loadManageableVariable } from "../shared/variable_scope.service";
import { assertUniqueProductCategoryName } from "../shared/product_category.service";
import { assertUniqueAdvertisementZoneCode } from "../shared/advertisement_zone.service";

// companyId=null (solo para llamadas is_system) omite el filtro de tenant,
// igual que en update/find -- ver comentario en update.service.ts.
// Una fila global (company_id NULL) solo la deshabilita un is_system: para los
// demás lanza 403.
// Toggle (no acción de una sola dirección) para poder deshabilitar y volver
// a habilitar desde el mismo botón, igual que "client"/"product".
export async function disableOrEnableVariableGeneralById({
  id,
  companyId,
  updatedBy,
}: {
  id: number;
  companyId: number | null;
  updatedBy?: number;
}): Promise<[number]> {
  const current = await loadManageableVariable(id, companyId);
  // Inexistente o de otra empresa: el controller responde 404.
  if (!current) return [0];

  const where: Record<string, unknown> = { id };
  if (companyId !== null) where.company_id = companyId;

  // Rehabilitar una categoría/subcategoría de producto no puede dejar dos
  // activas con el mismo nombre (así se colaban los duplicados en el selector
  // del producto). Deshabilitar siempre se puede.
  if (current.is_deleted) {
    await assertUniqueProductCategoryName({
      id,
      category: current.category,
      name: current.name,
      ref1: current.ref1,
      companyId: current.company_id === null ? null : Number(current.company_id),
    });
    await assertUniqueAdvertisementZoneCode({
      id,
      category: current.category,
      code: current.prefix_id,
      companyId: current.company_id === null ? null : Number(current.company_id),
    });
  }

  return DataBase.instance.variable_general.update(
    {
      is_deleted: literal("CASE WHEN is_deleted = true THEN false ELSE true END"),
      updated_by: updatedBy,
      updated_at: nowUtc(),
    },
    { where }
  );
}

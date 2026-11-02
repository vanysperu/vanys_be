import { literal } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { loadManageableVariable } from "../shared/variable_scope.service";

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

  return DataBase.instance.variable_general.update(
    {
      is_deleted: literal("CASE WHEN is_deleted = true THEN false ELSE true END"),
      updated_by: updatedBy,
      updated_at: nowUtc(),
    },
    { where }
  );
}

import { literal } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";

// companyId=null (solo para llamadas is_system) omite el filtro de tenant,
// igual que en update/find -- ver comentario en update.service.ts.
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
}) {
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

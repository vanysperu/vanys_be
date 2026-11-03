import { AppError } from "../../../../../core/errors/AppError";
import { DataBase } from "../../../../../database";
import { VariableGeneralModel } from "../../models/variable_general.model";

// Código estable para que el frontend distinga este 403 de otros.
export const GLOBAL_VARIABLE_FORBIDDEN_CODE = "GLOBAL_VARIABLE_FORBIDDEN";

export const buildGlobalVariableForbiddenError = (): AppError =>
  new AppError(
    403,
    "Las variables globales solo las gestiona el Super Administrador",
    undefined,
    GLOBAL_VARIABLE_FORBIDDEN_CODE
  );

/**
 * Carga la fila objetivo de una operación de gestión (detalle, editar,
 * deshabilitar, eliminar) aplicando la regla de alcance:
 * - companyId = null (solo is_system): ve cualquier fila.
 * - Fila inexistente o de OTRA empresa: devuelve null (el caller responde 404,
 *   no se revela que existe).
 * - Fila global (company_id NULL) y el actor NO es is_system: 403. Los selectores
 *   de otras pantallas siguen leyendo las globales por el listado genérico,
 *   pero gestionarlas es exclusivo del Super Administrador.
 */
export const loadManageableVariable = async (
  id: number,
  companyId: number | null
): Promise<VariableGeneralModel | null> => {
  const row = await DataBase.instance.variable_general.findByPk(id);
  if (!row) return null;
  if (companyId === null) return row;
  if (row.company_id === null) throw buildGlobalVariableForbiddenError();
  if (row.company_id !== companyId) return null;
  return row;
};

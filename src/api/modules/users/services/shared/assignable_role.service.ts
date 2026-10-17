import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";

/**
 * Escalada de privilegios real encontrada en auditoría: `createUser` y
 * `updateUser` forzaban cuidadosamente `company_id` y `business_unit_id`
 * (nunca se confía en el body, CLAUDE.md sección 10) pero pasaban `roleIds`
 * TAL CUAL desde el body, sin validar nada.
 *
 * El rol id 1 ("Super Administrador") tiene is_system = true, y un rol
 * is_system recibe TODAS las rutas activas sin pasar por roles_resources
 * (ver resource/services/find/getAllowedRoutesByUser.service.ts). Así que
 * un Administrador de empresa podía hacer:
 *
 *     PUT /user/update/<su propio id>   { "roleIds": 1 }
 *
 * y en el siguiente request era Super Administrador de la plataforma, con
 * acceso a TODAS las empresas. El id es fijo y adivinable; que
 * `GET /role/list` esconda los roles is_system solo lo oculta en la UI, no
 * lo impide.
 *
 * Reglas de asignación:
 * - Nadie puede asignar un rol is_system salvo un caller que ya sea
 *   is_system (la plataforma sí puede crear otro super admin).
 * - Un rol con company_id NULL y is_system = false es una PLANTILLA
 *   compartida (Administrador/Especialista/Gestor): la puede usar
 *   cualquier empresa, es el caso normal.
 * - Un rol con company_id seteado solo lo puede asignar alguien de esa
 *   misma empresa, y solo a un usuario de esa misma empresa.
 * - El rol debe existir y estar activo.
 */
export const assertRoleIsAssignable = async ({
  roleId,
  callerIsSystem,
  targetCompanyId,
}: {
  roleId: number | string | null | undefined;
  callerIsSystem: boolean;
  targetCompanyId: number | null;
}): Promise<void> => {
  if (roleId === null || roleId === undefined || roleId === "") return;

  const parsedRoleId = Number(roleId);
  if (!Number.isInteger(parsedRoleId) || parsedRoleId <= 0) {
    throw new AppError(400, "El rol seleccionado no es válido");
  }

  const role = await DataBase.instance.role.findOne({ where: { id: parsedRoleId } });
  if (!role) throw new AppError(404, "El rol seleccionado no existe");
  if (!role.status) throw new AppError(400, "El rol seleccionado está deshabilitado");

  if (role.is_system && !callerIsSystem) {
    throw new AppError(403, "No puedes asignar un rol de plataforma");
  }

  // company_id NULL = rol plantilla compartido por todas las empresas.
  if (role.company_id === null) return;

  if (role.company_id !== targetCompanyId) {
    throw new AppError(403, "El rol seleccionado no pertenece a esta empresa");
  }
};

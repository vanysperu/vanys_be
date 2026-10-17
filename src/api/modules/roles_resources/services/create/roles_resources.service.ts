import { QueryTypes, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";

/**
 * Otorga resources a un rol.
 *
 * Hueco real encontrado en auditoría: el controller validaba que el ROL
 * objetivo fuera de la empresa del caller, pero no validaba QUÉ resources
 * se estaban otorgando — se insertaba cualquier `resource_id` del catálogo
 * global. Un Administrador de empresa podía entonces otorgarle a su propio
 * rol los resources de plataforma (gestión de empresas, módulos, resources,
 * tiendas) que su rol nunca tuvo. Hoy casi todas esas rutas están
 * respaldadas por `requireSystemRole`, así que el daño quedaba acotado a
 * ver el catálogo RBAC global y a ítems de menú que no debería ver — pero
 * la protección dependía por completo de que alguien se acordara de poner
 * ese middleware en cada ruta nueva.
 *
 * Regla aplicada: nadie puede otorgar un acceso que su propio rol no tenga
 * ("can't grant what you don't have"). Un caller is_system no tiene esta
 * restricción: la plataforma sí administra el catálogo completo.
 *
 * Verificado contra los datos de fábrica: el rol Administrador (74 accesos)
 * es superconjunto estricto de Especialista (21) y Gestor (32), así que la
 * regla no bloquea ninguna asignación legítima que hoy funcione.
 */
const grantResourcesToRole = async ({
  roleId,
  resourceIds,
  createdBy,
  callerUserId,
  callerIsSystem,
  transaction,
}: {
  roleId: number;
  resourceIds: number[];
  createdBy?: number;
  callerUserId: number;
  callerIsSystem: boolean;
  transaction?: Transaction;
}) => {
  // Un is_system administra el catálogo completo, sin filtro.
  const callerOwnedFilter = callerIsSystem
    ? ""
    : `and r.id in (
         select rr2.resource_id from roles_resources rr2
         inner join user_role ur on ur.role_id = rr2.role_id
         where ur.user_id = :callerUserId
       )`;

  const query = `
    insert into roles_resources (role_id, resource_id, created_by, created_at)
    select :roleId, r.id, :createdBy, NOW() from resources r
    where r.id in (:resourceIds) and r.id not in (
      select rr.resource_id from roles_resources rr
      where rr.role_id = :roleId
    ) ${callerOwnedFilter}
  `;

  return await DataBase.instance.sequelize.query(query, {
    type: QueryTypes.INSERT,
    replacements: { roleId, resourceIds, createdBy: createdBy ?? null, callerUserId },
    transaction,
  });
};

export { grantResourcesToRole };

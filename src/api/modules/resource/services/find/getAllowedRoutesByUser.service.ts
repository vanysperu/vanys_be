import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";

export interface RespRoutes {
  roles: string;
  routes: string;
}

/**
 * Arma la lista de rutas de API permitidas para un usuario (unión de TODOS
 * sus roles), consumida por passport.ts para poblar req.user.allowedRoutes.
 * Si alguno de sus roles es `is_system`, se le otorgan todas las rutas
 * activas (resources de tipo button/endpoint con route+verb), sin necesitar
 * filas en roles_resources.
 *
 * `roles` y `routes` se calculan por separado a propósito: un rol recién
 * creado sin ningún resource otorgado todavía debe seguir contando como un
 * rol válido (login permitido, solo sin acceso a rutas protegidas todavía),
 * no desaparecer de la lista de roles por un INNER JOIN.
 */
export const getUserRolesAndRoutes = async (userId: number) => {
  try {
    const query = `
      WITH user_roles AS (
        SELECT r.id AS role_id, r.is_system
        FROM user_role ur
        INNER JOIN role r ON ur.role_id = r.id
        WHERE ur.user_id = ? AND r.status = true
      ),
      operations AS (
        -- Roles normales: solo las rutas que tienen otorgadas en roles_resources
        SELECT ur.role_id, res.route, res.verb
        FROM user_roles ur
        INNER JOIN roles_resources rr ON rr.role_id = ur.role_id
        INNER JOIN resources res ON res.id = rr.resource_id
        WHERE ur.is_system = false
          AND res.type IN ('button', 'endpoint') AND res.route IS NOT NULL AND res.active = true

        UNION ALL

        -- Roles is_system: todas las rutas activas, sin pasar por roles_resources
        SELECT ur.role_id, res.route, res.verb
        FROM user_roles ur
        CROSS JOIN resources res
        WHERE ur.is_system = true
          AND res.type IN ('button', 'endpoint') AND res.route IS NOT NULL AND res.active = true
      )
      SELECT
        (SELECT COALESCE(JSON_ARRAYAGG(role_id), '[]') FROM user_roles) AS roles,
        (
          SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT('route', route, 'verb', verb)), '[]')
          FROM (SELECT DISTINCT route, verb FROM operations) distinct_ops
        ) AS routes;
    `;

    return (await DataBase.instance.sequelize.query(query, {
      type: QueryTypes.SELECT,
      replacements: [userId],
    })) as RespRoutes[];
  } catch (error) {
    throw error;
  }
};

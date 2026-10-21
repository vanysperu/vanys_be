"use strict";

// "Roles y accesos" (módulo roles_access: roles, accesos por rol y el
// catálogo de módulos/recursos) pasa a ser EXCLUSIVO del Super Administrador
// (pedido explícito del usuario: "solo el super admin vea lo de módulos y
// accesos de roles"). El backend lo hace cumplir en
// src/core/rbac/systemOnlyModules.ts y con requireSystemRole en las rutas;
// esta seeder acomoda los datos:
//
// 1. El formulario de Usuarios lista roles (selector de rol al crear/editar
//    y filtro de la tabla) con GET /role/list, registrado hasta hoy dentro
//    de roles_access (resource 14). Se muda al módulo users, colgado de la
//    vista de Usuarios: el administrador de empresa sigue asignando roles
//    sin ver la pantalla de Roles y accesos. Se muda (no se duplica) porque
//    resources tiene un único (route, verb).
// 2. Se revoca todo lo que queda de roles_access a los roles que no son de
//    plataforma, salvo "Ver todas las tiendas"
//    (roles_access.viewAllBusinessUnits.button): es un permiso de alcance de
//    datos que el Super Administrador sí le da a roles de empresa.
// 3. GET /role/list se otorga a todo rol que tenga la vista de Usuarios.
//
// Todo en una transacción: sin ella, una falla a la mitad dejaba los
// accesos revocados sin el reemplazo para el formulario de Usuarios.
const ROLE_LIST_RESOURCE_ID = 14;
const USERS_MODULE_ID = 1;
const USERS_LIST_VIEW_ID = 1;
const VIEW_ALL_BUSINESS_UNITS_CODE = "roles_access.viewAllBusinessUnits.button";

const MOVED = {
  module_id: USERS_MODULE_ID,
  parent_id: USERS_LIST_VIEW_ID,
  code: "users.roleOptions.endpoint",
  name: "Listar roles para asignar (API)",
  show_in_menu: false,
};

// Cómo estaba antes (seed-base-rbac + 20260928120000-grant-roles-access-to-admin),
// para poder revertir.
const ORIGINAL = {
  module_id: 2,
  parent_id: 10,
  code: "roles_access.role.list.endpoint",
  name: "Listar roles (API)",
  show_in_menu: true,
};
const ADMIN_ROLE_ID = 2;
const PREVIOUS_ADMIN_ROLES_ACCESS_IDS = [10, 11, 12, 13, 14, 15, 16];

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.bulkUpdate("resources", MOVED, { id: ROLE_LIST_RESOURCE_ID }, { transaction });

      await queryInterface.sequelize.query(
        `DELETE rr FROM roles_resources rr
         INNER JOIN resources res ON res.id = rr.resource_id
         INNER JOIN modules m ON m.id = res.module_id
         INNER JOIN role r ON r.id = rr.role_id
         WHERE m.code = 'roles_access' AND res.code <> :keepCode AND r.is_system = false`,
        { replacements: { keepCode: VIEW_ALL_BUSINESS_UNITS_CODE }, transaction }
      );

      // UTC_TIMESTAMP(): en SQL crudo un Date de JS se formatearía con la
      // zona horaria local del servidor.
      await queryInterface.sequelize.query(
        `INSERT INTO roles_resources (role_id, resource_id, created_at)
         SELECT DISTINCT rr.role_id, :resourceId, UTC_TIMESTAMP()
         FROM roles_resources rr
         INNER JOIN role r ON r.id = rr.role_id
         WHERE rr.resource_id = :usersListId AND r.is_system = false
           AND NOT EXISTS (
             SELECT 1 FROM roles_resources existing
             WHERE existing.role_id = rr.role_id AND existing.resource_id = :resourceId
           )`,
        { replacements: { resourceId: ROLE_LIST_RESOURCE_ID, usersListId: USERS_LIST_VIEW_ID }, transaction }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.bulkUpdate("resources", ORIGINAL, { id: ROLE_LIST_RESOURCE_ID }, { transaction });
      await queryInterface.bulkDelete("roles_resources", { resource_id: ROLE_LIST_RESOURCE_ID }, { transaction });

      // Solo se puede restaurar lo que se conoce: los accesos del rol
      // plantilla Administrador. Los roles propios de cada empresa que
      // tuvieran algo de roles_access no se reconstruyen.
      await queryInterface.sequelize.query(
        `INSERT INTO roles_resources (role_id, resource_id, created_at)
         SELECT :roleId, res.id, UTC_TIMESTAMP() FROM resources res
         WHERE res.id IN (:resourceIds)
           AND NOT EXISTS (
             SELECT 1 FROM roles_resources existing
             WHERE existing.role_id = :roleId AND existing.resource_id = res.id
           )`,
        { replacements: { roleId: ADMIN_ROLE_ID, resourceIds: PREVIOUS_ADMIN_ROLES_ACCESS_IDS }, transaction }
      );
    });
  },
};

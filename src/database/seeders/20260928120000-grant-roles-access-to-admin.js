"use strict";

// Bug encontrado al probar: el rol "Administrador" (id 2, plantilla global)
// no tenía NINGÚN recurso del módulo "roles_access" otorgado — ni siquiera
// poder LISTAR roles (`GET /role/list` devolvía 403 directo, antes de
// llegar a cualquier filtro de empresa). Por eso el selector de rol salía
// vacío al crear un usuario, pedido explícito del usuario: "sigue sin salir
// el rol para cuando un admin quiere crear un gestor".
//
// Se le otorga lo necesario para gestionar SUS roles (ver/crear/editar/
// deshabilitar roles, asignarles módulos) — NO se le otorga crear/editar/
// deshabilitar módulos ni recursos crudos (ids 17-25), eso sigue siendo
// exclusivo de is_system (CLAUDE.md sección 10: el catálogo RBAC
// compartido es de plataforma).
const now = new Date();

const ADMIN_ROLE_ID = 2;
const RESOURCE_IDS = [
  10, // roles_access.list (vista "Roles y accesos")
  11, // roles_access.role.create.button
  12, // roles_access.role.update.button
  13, // roles_access.role.disable.button
  14, // roles_access.role.list.endpoint
  15, // roles_access.assign.button ("Gestionar accesos")
  16, // roles_access.tree.endpoint
];

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert(
      "roles_resources",
      RESOURCE_IDS.map((resource_id) => ({ role_id: ADMIN_ROLE_ID, resource_id, created_at: now }))
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("roles_resources", { role_id: ADMIN_ROLE_ID, resource_id: RESOURCE_IDS });
  },
};

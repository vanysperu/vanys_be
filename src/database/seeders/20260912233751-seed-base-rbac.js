"use strict";

// Datos base del RBAC unificado: los módulos/recursos que ya existen hoy en
// el código (users, roles_access, variable_general). El rol admin (id 1,
// "Super Administrador") ya queda marcado is_system=true desde el seeder
// 20260912233700-seed-core-data.js, así que nunca depende de filas en
// roles_resources para acceder al propio panel de administración.

const now = new Date();

const modules = [
  { id: 1, code: "users", name: "Usuarios", description: "Gestión de usuarios del sistema", icon: "profile-circle", position: 1, active: true, created_at: now },
  { id: 2, code: "roles_access", name: "Roles y Accesos", description: "Gestión de roles, módulos, recursos y permisos", icon: "shield-tick", position: 2, active: true, created_at: now },
  { id: 3, code: "variable_general", name: "Variables Generales", description: "Configuración general del sistema", icon: "setting-2", position: 3, active: true, created_at: now },
];

// Cada fila: [id, module_id, parent_id, type, code, name, route, verb, showInMenu, icon]
// El ícono solo va en las filas tipo "view" (las que aparecen en el sidebar).
const resourceRows = [
  // ---- Módulo 1: users ----
  [1, 1, null, "view", "users.list", "Listado de usuarios", "/seguridad/usuarios", null, true, "profile-circle"],
  [2, 1, 1, "button", "users.create.button", "Crear usuario", "/user/create", "POST", true],
  [3, 1, 1, "button", "users.update.button", "Actualizar usuario", "/user/update/*", "PUT", true],
  [4, 1, 1, "button", "users.disable.button", "Deshabilitar usuario", "/user/disable/*", "PUT", true],
  [5, 1, 1, "button", "users.batchDisable.button", "Deshabilitar usuarios en lote", "/user/batch/disable", "PUT", true],
  [6, 1, 1, "endpoint", "users.list.endpoint", "Listar usuarios (API)", "/user/list", "GET", true],
  [7, 1, 1, "endpoint", "users.find.endpoint", "Buscar usuario por ID (API)", "/user/find/*", "GET", true],
  [8, 1, 1, "endpoint", "users.account.endpoint", "Cuenta del usuario actual (API)", "/user/user-account", "GET", true],
  [9, 1, 1, "endpoint", "users.changePassword.endpoint", "Cambiar contraseña (API)", "/user/change/password", "PATCH", true],

  // ---- Módulo 2: roles_access ----
  [10, 2, null, "view", "roles_access.list", "Roles y accesos", "/seguridad/roles-accesos", null, true, "shield-tick"],
  [11, 2, 10, "button", "roles_access.role.create.button", "Crear rol", "/role/create", "POST", true],
  [12, 2, 10, "button", "roles_access.role.update.button", "Actualizar rol", "/role/update/*", "PUT", true],
  [13, 2, 10, "button", "roles_access.role.disable.button", "Deshabilitar rol", "/role/disable/*", "PUT", true],
  [14, 2, 10, "endpoint", "roles_access.role.list.endpoint", "Listar roles (API)", "/role/list", "GET", true],
  [15, 2, 10, "button", "roles_access.assign.button", "Asignar accesos a un rol", "/roles/*/resources", "PUT", true],
  [16, 2, 10, "endpoint", "roles_access.tree.endpoint", "Árbol de accesos por rol (API)", "/roles/*/resources", "GET", true],
  [17, 2, 10, "button", "roles_access.module.create.button", "Crear módulo", "/module/create", "POST", true],
  [18, 2, 10, "button", "roles_access.module.update.button", "Actualizar módulo", "/module/update/*", "PUT", true],
  [19, 2, 10, "button", "roles_access.module.disable.button", "Deshabilitar módulo", "/module/disable/*", "PUT", true],
  [20, 2, 10, "endpoint", "roles_access.module.list.endpoint", "Listar módulos (API)", "/module/list", "GET", true],
  [21, 2, 10, "button", "roles_access.resource.create.button", "Crear recurso", "/resource/create", "POST", true],
  [22, 2, 10, "button", "roles_access.resource.update.button", "Actualizar recurso", "/resource/update/*", "PUT", true],
  [23, 2, 10, "button", "roles_access.resource.disable.button", "Deshabilitar recurso", "/resource/disable/*", "PUT", true],
  [24, 2, 10, "endpoint", "roles_access.resource.list.endpoint", "Listar recursos (API)", "/resource/list", "GET", true],
  [25, 2, 10, "endpoint", "roles_access.resource.find.endpoint", "Buscar recurso por ID (API)", "/resource/*", "GET", true],

  // ---- Módulo 3: variable_general ----
  [26, 3, null, "view", "variable_general.list", "Variables generales", "/configuracion/variables-generales", null, true, "setting-2"],
  [27, 3, 26, "button", "variable_general.create.button", "Crear variable general", "/variable_general/create", "POST", true],
  [28, 3, 26, "button", "variable_general.update.button", "Actualizar variable general", "/variable_general/update/*", "PUT", true],
  [29, 3, 26, "button", "variable_general.delete.button", "Eliminar variable general", "/variable_general/delete/*", "DELETE", true],
  [30, 3, 26, "endpoint", "variable_general.list.endpoint", "Listar variables generales (API)", "/variable_general/list", "GET", true],
  [31, 3, 26, "endpoint", "variable_general.detail.endpoint", "Detalle de variable general (API)", "/variable_general/detail/*", "GET", true],
];

const resources = resourceRows.map(([id, module_id, parent_id, type, code, name, route, verb, show_in_menu, icon]) => ({
  id,
  module_id,
  parent_id,
  type,
  code,
  name,
  description: null,
  route,
  verb,
  icon: icon ?? null,
  show_in_menu,
  position: id,
  active: true,
  created_at: now,
}));

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert("modules", modules);
    await queryInterface.bulkInsert("resources", resources);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("resources", null, {});
    await queryInterface.bulkDelete("modules", null, {});
  },
};

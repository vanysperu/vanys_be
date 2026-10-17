"use strict";

// Endpoints de gestión de empresas/tiendas (alta de tenants) — acción de
// plataforma, protegida además por el middleware requireSystemRole en el
// código. Se seedean como `resources` para que `verifyAccess` deje pasar a
// los usuarios is_system (su bypass solo otorga rutas que existan como
// resource). No se les da vista de menú: no hay pantalla de frontend en
// este pase.

const now = new Date();

const modules = [
  { id: 4, code: "platform", name: "Plataforma", description: "Gestión de empresas y tiendas (multi-tenant)", icon: "abstract-26", position: 4, active: true, created_at: now },
];

const resourceRows = [
  [32, 4, null, "endpoint", "platform.company.list.endpoint", "Listar empresas (API)", "/company/list", "GET"],
  [33, 4, null, "endpoint", "platform.company.create.endpoint", "Crear empresa (API)", "/company/create", "POST"],
  [34, 4, null, "endpoint", "platform.company.update.endpoint", "Actualizar empresa (API)", "/company/update/*", "PUT"],
  [35, 4, null, "endpoint", "platform.company.disable.endpoint", "Deshabilitar empresa (API)", "/company/disable/*", "PUT"],
  [36, 4, null, "endpoint", "platform.businessUnit.list.endpoint", "Listar tiendas (API)", "/business-unit/list", "GET"],
  [37, 4, null, "endpoint", "platform.businessUnit.create.endpoint", "Crear tienda (API)", "/business-unit/create", "POST"],
  [38, 4, null, "endpoint", "platform.businessUnit.update.endpoint", "Actualizar tienda (API)", "/business-unit/update/*", "PUT"],
  [39, 4, null, "endpoint", "platform.businessUnit.disable.endpoint", "Deshabilitar tienda (API)", "/business-unit/disable/*", "PUT"],
];

const resources = resourceRows.map(([id, module_id, parent_id, type, code, name, route, verb]) => ({
  id,
  module_id,
  parent_id,
  type,
  code,
  name,
  description: null,
  route,
  verb,
  icon: null,
  show_in_menu: false,
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
    await queryInterface.bulkDelete("resources", { module_id: 4 });
    await queryInterface.bulkDelete("modules", { id: 4 });
  },
};

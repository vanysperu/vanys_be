"use strict";

// Vista de frontend para gestionar tiendas (business_unit) de una empresa.
// Mismo nivel de acceso que "Empresas": solo is_system (create/update/
// disable de business_unit ya están gateados por requireSystemRole en el
// router). El endpoint /business-unit/list ya está registrado desde
// seed-platform-tenant-resources.js (id 36), solo faltaba la vista.

const now = new Date();

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert("resources", [
      {
        id: 42,
        module_id: 4,
        parent_id: null,
        type: "view",
        code: "platform.businessUnit.view",
        name: "Tiendas",
        description: null,
        route: "/configuracion/tiendas",
        verb: null,
        icon: "shop",
        show_in_menu: true,
        position: 42,
        active: true,
        created_at: now,
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("resources", { id: 42 });
  },
};

"use strict";

// Módulo "Estadísticas" (pedido explícito del usuario: "estadísticas que en
// verdad nos sirvan"). Va en el menú justo después de "Inicio": el resto de
// los módulos baja un lugar.
//
// Es una vista de GESTIÓN (cuánto se vende, cuánto se cobra, quién vende),
// no operativa: se otorga solo al rol plantilla "Administrador". Un admin
// puede dárselo a otros roles desde "Roles y accesos"; si un rol atado a una
// tienda lo recibe, el backend igual le limita los datos a su tienda.
const now = new Date();

const STATISTICS_MODULE_ID = 18;
const STATISTICS_POSITION = 1;
const ADMIN_ROLE_ID = 2;

const resourceRows = [
  [169, null, "view", "statistics.view", "Estadísticas", "/estadisticas", null, true, "chart"],
  [170, 169, "endpoint", "statistics.overview.endpoint", "Tablero de estadísticas (API)", "/statistics/overview", "GET", false],
];

const resources = resourceRows.map(([id, parent_id, type, code, name, route, verb, show_in_menu, icon]) => ({
  id,
  module_id: STATISTICS_MODULE_ID,
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

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      "UPDATE modules SET position = position + 1 WHERE position >= :position AND id <> :id",
      { replacements: { position: STATISTICS_POSITION, id: STATISTICS_MODULE_ID } }
    );

    await queryInterface.bulkInsert("modules", [
      {
        id: STATISTICS_MODULE_ID,
        code: "statistics",
        name: "Estadísticas",
        description: "Ventas, cobros, conversión, clientes, productos y rendimiento por vendedor",
        icon: "chart",
        position: STATISTICS_POSITION,
        active: true,
        created_at: now,
      },
    ]);
    await queryInterface.bulkInsert("resources", resources);

    await queryInterface.bulkInsert(
      "roles_resources",
      resources.map((resource) => ({ role_id: ADMIN_ROLE_ID, resource_id: resource.id, created_at: now }))
    );
  },

  async down(queryInterface) {
    const resourceIds = resourceRows.map((row) => row[0]);
    await queryInterface.bulkDelete("roles_resources", { resource_id: resourceIds });
    await queryInterface.bulkDelete("resources", { id: resourceIds });
    await queryInterface.bulkDelete("modules", { id: [STATISTICS_MODULE_ID] });
    await queryInterface.sequelize.query("UPDATE modules SET position = position - 1 WHERE position > :position", {
      replacements: { position: STATISTICS_POSITION },
    });
  },
};

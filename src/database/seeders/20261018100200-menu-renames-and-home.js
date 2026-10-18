"use strict";

// Cambios de menú pedidos explícitamente por el usuario:
//   - Nueva entrada "Inicio" (primera del menú): lleva al panel principal, el
//     mismo lugar al que lleva tocar el logo "Grulla".
//   - "Listado de usuarios" -> "Usuarios"
//   - "Variables generales" -> "Generales"
//   - "Productos" -> "Lista de precios"
//   - "Pagos" -> "Pagos recibidos" (son los pagos que hacen los clientes).
//
// El menú del frontend se arma 100% desde estas filas (CLAUDE.md sección 2),
// así que renombrar acá alcanza para que cambie en todas las pantallas.
const now = new Date();

const HOME_MODULE_ID = 15;
const HOME_VIEW_ID = 158;

// [tabla, id, nombre nuevo, nombre anterior]
const RENAMES = [
  ["resources", 1, "Usuarios", "Listado de usuarios"],
  ["resources", 26, "Generales", "Variables generales"],
  ["modules", 3, "Generales", "Variables Generales"],
  ["resources", 60, "Lista de precios", "Productos"],
  ["modules", 6, "Lista de precios", "Productos"],
  ["resources", 151, "Pagos recibidos", "Pagos"],
  ["modules", 13, "Pagos recibidos", "Pagos"],
];

module.exports = {
  async up(queryInterface) {
    for (const [table, id, name] of RENAMES) {
      await queryInterface.bulkUpdate(table, { name }, { id });
    }

    await queryInterface.bulkInsert("modules", [
      {
        id: HOME_MODULE_ID,
        code: "inicio",
        name: "Inicio",
        description: "Panel principal",
        icon: "layout-dashboard",
        // Antes que cualquier otro módulo (el resto arranca en 1).
        position: 0,
        active: true,
        created_at: now,
      },
    ]);

    await queryInterface.bulkInsert("resources", [
      {
        id: HOME_VIEW_ID,
        module_id: HOME_MODULE_ID,
        parent_id: null,
        type: "view",
        code: "inicio.view",
        name: "Inicio",
        description: null,
        route: "/",
        verb: null,
        icon: "layout-dashboard",
        show_in_menu: true,
        position: 0,
        active: true,
        created_at: now,
      },
    ]);

    // "Inicio" es navegación básica: se otorga a TODOS los roles que no son
    // de plataforma (los is_system ya ven todo). Los roles que se creen
    // después la reciben al crearse (ver role/services/create).
    await queryInterface.sequelize.query(
      `INSERT INTO roles_resources (role_id, resource_id, created_at)
       SELECT r.id, :resourceId, NOW() FROM role r
       WHERE r.is_system = false
         AND NOT EXISTS (SELECT 1 FROM roles_resources rr WHERE rr.role_id = r.id AND rr.resource_id = :resourceId)`,
      { replacements: { resourceId: HOME_VIEW_ID } }
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("roles_resources", { resource_id: [HOME_VIEW_ID] });
    await queryInterface.bulkDelete("resources", { id: [HOME_VIEW_ID] });
    await queryInterface.bulkDelete("modules", { id: [HOME_MODULE_ID] });
    for (const [table, id, , previousName] of RENAMES) {
      await queryInterface.bulkUpdate(table, { name: previousName }, { id });
    }
  },
};

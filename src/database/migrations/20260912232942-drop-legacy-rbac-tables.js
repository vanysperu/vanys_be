"use strict";

// Elimina las tablas del RBAC viejo (fragmentado en 3 sistemas desconectados,
// ver plan de RBAC unificado). Se reemplazan por modules/resources/roles_resources.
// El down() no las recrea: eran piezas rotas/incompletas (una referenciaba una
// tabla "functionalities" inexistente, otra era un stub sin uso real), no vale
// la pena reconstruir ese esquema para un rollback.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // Orden importa por FKs: primero las tablas puente, luego las de catálogo.
    await queryInterface.dropTable("role_module_view_interface");
    await queryInterface.dropTable("view_routes_interface");
    await queryInterface.dropTable("role_operations");
    await queryInterface.dropTable("allowed_operations");
    await queryInterface.dropTable("role_module");
    await queryInterface.dropTable("module");
  },

  async down() {
    // Intencionalmente no reversible, ver nota arriba.
  },
};

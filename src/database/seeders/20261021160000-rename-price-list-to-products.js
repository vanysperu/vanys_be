"use strict";

// "Lista de precios" vuelve a llamarse "Productos" (pedido explícito del
// usuario). Revierte solo ese nombre de 20261018100200-menu-renames-and-home.js:
// el módulo 6 (producto) y su vista principal (resource 60, producto.list).
// El menú del frontend se arma desde estas filas, así que con esto alcanza.

// [tabla, id, nombre nuevo, nombre anterior]
const RENAMES = [
  ["modules", 6, "Productos", "Lista de precios"],
  ["resources", 60, "Productos", "Lista de precios"],
];

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const [table, id, name] of RENAMES) {
        await queryInterface.bulkUpdate(table, { name }, { id }, { transaction });
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const [table, id, , previousName] of RENAMES) {
        await queryInterface.bulkUpdate(table, { name: previousName }, { id }, { transaction });
      }
    });
  },
};

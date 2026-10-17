"use strict";

// `company.tenant_id` era una columna suelta y ambigua sin ninguna relación
// real (ni FK, ni asociación Sequelize) que competía conceptualmente con la
// decisión de que `company` ES el tenant. Se elimina para no tener dos
// nociones de "tenant" en el sistema.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.removeColumn("company", "tenant_id");
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn("company", "tenant_id", {
      type: Sequelize.BIGINT,
      allowNull: true,
    });
  },
};

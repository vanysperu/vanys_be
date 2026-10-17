"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // company_id = NULL pasa a significar "variable global" (visible para
    // TODAS las empresas, ej. tipos de documento). Solo un usuario is_system
    // puede crear/editar/eliminar una variable con company_id NULL (ver
    // variable_general.service.ts) — una empresa normal solo administra las
    // suyas propias.
    await queryInterface.changeColumn("general_variable", "company_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("general_variable", "company_id", {
      type: Sequelize.INTEGER,
      allowNull: false,
    });
  },
};

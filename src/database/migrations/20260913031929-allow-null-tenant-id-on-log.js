"use strict";

// El actor de un log puede ser un usuario is_system (sin empresa/company_id),
// así que tenant_id ya no puede ser obligatorio.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("log", "tenant_id", {
      type: Sequelize.BIGINT,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("log", "tenant_id", {
      type: Sequelize.BIGINT,
      allowNull: false,
    });
  },
};

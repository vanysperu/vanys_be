"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("variable_general", {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
      category: { type: Sequelize.STRING(255), allowNull: false },
      title: { type: Sequelize.STRING(255), allowNull: false },
      prefix_id: { type: Sequelize.STRING(255), allowNull: false },
      name: { type: Sequelize.STRING(255), allowNull: false },
      description: { type: Sequelize.STRING(255), allowNull: false },
      ref1: { type: Sequelize.STRING(255), allowNull: true },
      ref2: { type: Sequelize.STRING(255), allowNull: true },
      tenant_id: { type: Sequelize.INTEGER, allowNull: false },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("variable_general");
  },
};

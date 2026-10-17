"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Catálogo cerrado de paletas de marca seleccionables por empresa (company.theme_color
    // referencia el `code` de esta tabla). Cada fila trae ya resueltos los 5 valores
    // derivados que Bootstrap/Metronic precompila (base/active/light/clarity/inverse)
    // para que el front pueda pintar el select con swatches sin hardcodear los colores
    // y sin romper los estados de hover/fondo-claro que dependen de esos derivados.
    await queryInterface.createTable("themes", {
      id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      code: {
        type: Sequelize.STRING(30),
        allowNull: false,
        unique: true,
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      primary_color: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      primary_active_color: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      primary_light_color: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      primary_clarity_color: {
        type: Sequelize.STRING(40),
        allowNull: false,
      },
      primary_inverse_color: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      position: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_by: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_by: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("themes");
  },
};

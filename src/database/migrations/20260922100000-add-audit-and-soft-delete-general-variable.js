"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // La tabla "general_variable" nunca tuvo columnas de auditoría ni de
    // soft-delete (CLAUDE.md secciones 1 y 3 las exigen en TODA tabla). El
    // endpoint de eliminación actual hacía DELETE físico -- se agrega
    // is_deleted para poder reemplazarlo por un toggle de deshabilitar,
    // igual que "client"/"product", sin perder los registros existentes.
    await queryInterface.addColumn("general_variable", "is_deleted", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn("general_variable", "created_by", {
      type: Sequelize.BIGINT,
      allowNull: true,
    });
    await queryInterface.addColumn("general_variable", "created_at", {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.fn("now"),
    });
    await queryInterface.addColumn("general_variable", "updated_by", {
      type: Sequelize.BIGINT,
      allowNull: true,
    });
    await queryInterface.addColumn("general_variable", "updated_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("general_variable", "updated_at");
    await queryInterface.removeColumn("general_variable", "updated_by");
    await queryInterface.removeColumn("general_variable", "created_at");
    await queryInterface.removeColumn("general_variable", "created_by");
    await queryInterface.removeColumn("general_variable", "is_deleted");
  },
};

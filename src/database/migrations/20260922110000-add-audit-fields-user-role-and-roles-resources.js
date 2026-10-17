"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // "user_role" nunca tuvo columnas de auditoría (CLAUDE.md sección 3 las
    // exige en TODA tabla). Se agregan ahora; nullable porque la tabla ya
    // tiene filas existentes y no hay forma confiable de reconstruir quién
    // creó cada asignación histórica.
    await queryInterface.addColumn("user_role", "created_by", {
      type: Sequelize.BIGINT,
      allowNull: true,
    });
    await queryInterface.addColumn("user_role", "created_at", {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.fn("NOW"),
    });
    await queryInterface.addColumn("user_role", "updated_by", {
      type: Sequelize.BIGINT,
      allowNull: true,
    });
    await queryInterface.addColumn("user_role", "updated_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });

    // "roles_resources" ya tenía created_by/created_at pero le faltaban
    // updated_by/updated_at (CLAUDE.md sección 3).
    await queryInterface.addColumn("roles_resources", "updated_by", {
      type: Sequelize.BIGINT,
      allowNull: true,
    });
    await queryInterface.addColumn("roles_resources", "updated_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("roles_resources", "updated_at");
    await queryInterface.removeColumn("roles_resources", "updated_by");

    await queryInterface.removeColumn("user_role", "updated_at");
    await queryInterface.removeColumn("user_role", "updated_by");
    await queryInterface.removeColumn("user_role", "created_at");
    await queryInterface.removeColumn("user_role", "created_by");
  },
};

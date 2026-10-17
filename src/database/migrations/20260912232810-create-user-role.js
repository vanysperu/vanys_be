"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("user_role", {
      user_id: { type: Sequelize.BIGINT, allowNull: false, primaryKey: true },
      role_id: { type: Sequelize.BIGINT, allowNull: false, primaryKey: true },
    });

    await queryInterface.addConstraint("user_role", {
      fields: ["user_id"],
      type: "foreign key",
      name: "fk_user_role_user_id",
      references: { table: "user", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    await queryInterface.addConstraint("user_role", {
      fields: ["role_id"],
      type: "foreign key",
      name: "fk_user_role_role_id",
      references: { table: "role", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("user_role");
  },
};

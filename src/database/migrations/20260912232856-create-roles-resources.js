"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("roles_resources", {
      role_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        primaryKey: true,
      },
      resource_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        primaryKey: true,
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
    });

    await queryInterface.addConstraint("roles_resources", {
      fields: ["role_id"],
      type: "foreign key",
      name: "fk_roles_resources_role_id",
      references: { table: "role", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    await queryInterface.addConstraint("roles_resources", {
      fields: ["resource_id"],
      type: "foreign key",
      name: "fk_roles_resources_resource_id",
      references: { table: "resources", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("roles_resources");
  },
};

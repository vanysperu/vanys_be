"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("resources", {
      id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      module_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
      },
      parent_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },
      type: {
        type: Sequelize.ENUM("view", "button", "endpoint"),
        allowNull: false,
      },
      code: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      route: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      verb: {
        type: Sequelize.STRING(10),
        allowNull: true,
      },
      icon: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      show_in_menu: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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

    await queryInterface.addConstraint("resources", {
      fields: ["module_id"],
      type: "foreign key",
      name: "fk_resources_module_id",
      references: { table: "modules", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    await queryInterface.addConstraint("resources", {
      fields: ["parent_id"],
      type: "foreign key",
      name: "fk_resources_parent_id",
      references: { table: "resources", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    await queryInterface.addIndex("resources", {
      fields: ["module_id", "code"],
      unique: true,
      name: "uq_resources_module_code",
    });

    await queryInterface.addIndex("resources", {
      fields: ["route", "verb"],
      unique: true,
      name: "uq_resources_route_verb",
    });

    await queryInterface.addIndex("resources", { fields: ["parent_id"] });
    await queryInterface.addIndex("resources", { fields: ["module_id"] });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("resources");
  },
};

"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("role", "company_id", {
      type: Sequelize.BIGINT,
      allowNull: true,
    });

    await queryInterface.addConstraint("role", {
      fields: ["company_id"],
      type: "foreign key",
      name: "fk_role_company_id",
      references: { table: "company", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint("role", "fk_role_company_id");
    await queryInterface.removeColumn("role", "company_id");
  },
};

"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.renameColumn("user", "tenant", "business_unit_id");

    await queryInterface.addConstraint("user", {
      fields: ["business_unit_id"],
      type: "foreign key",
      name: "fk_user_business_unit_id",
      references: { table: "business_unit", field: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint("user", "fk_user_business_unit_id");
    await queryInterface.renameColumn("user", "business_unit_id", "tenant");
  },
};

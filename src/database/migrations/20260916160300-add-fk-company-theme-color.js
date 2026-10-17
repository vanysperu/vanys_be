"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.addConstraint("company", {
      fields: ["theme_color"],
      type: "foreign key",
      name: "fk_company_theme_color",
      references: { table: "themes", field: "code" },
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint("company", "fk_company_theme_color");
  },
};

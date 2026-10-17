"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // theme_color: código de paleta de marca de la empresa (select en el front,
    // nunca un hex libre) para no romper los estados derivados (hover/light/etc.)
    // que Bootstrap/Metronic precompila por cada color.
    await queryInterface.addColumn("company", "theme_color", {
      type: Sequelize.STRING(30),
      allowNull: false,
      defaultValue: "blue",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("company", "theme_color");
  },
};

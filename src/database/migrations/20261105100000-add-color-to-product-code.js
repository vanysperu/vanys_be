"use strict";

const { columnExists } = require("../migration-helpers");

// Vincular un código con un color del producto (pedido explícito del usuario):
// un mismo producto puede tener un código por color (E1000-02 = Negro,
// E1000-03 = Azul...). Va en el código y no en el color porque un color puede
// tener varios códigos (uno por proveedor). Se guarda el NOMBRE del color: los
// colores se reemplazan como lista completa, así que sus ids no son estables.
module.exports = {
  async up(queryInterface, Sequelize) {
    if (await columnExists(queryInterface, "product_code", "color")) return;
    await queryInterface.addColumn("product_code", "color", { type: Sequelize.STRING(60), allowNull: true });
  },

  async down(queryInterface) {
    if (!(await columnExists(queryInterface, "product_code", "color"))) return;
    await queryInterface.removeColumn("product_code", "color");
  },
};

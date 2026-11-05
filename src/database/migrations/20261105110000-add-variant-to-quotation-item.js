"use strict";

const { columnExists } = require("../migration-helpers");

// Color y código de proveedor elegidos en cada item de la cotización (pedido
// explícito del usuario: el carrito de la web manda el código para saber qué
// color quiso el cliente). Se guardan como TEXTO, no como id: los colores y
// códigos del producto se reemplazan como lista completa, y una cotización ya
// armada no debe cambiar si después se edita el catálogo.
module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await columnExists(queryInterface, "quotation_item", "product_code"))) {
      await queryInterface.addColumn("quotation_item", "product_code", { type: Sequelize.STRING(60), allowNull: true });
    }
    if (!(await columnExists(queryInterface, "quotation_item", "color"))) {
      await queryInterface.addColumn("quotation_item", "color", { type: Sequelize.STRING(60), allowNull: true });
    }
  },

  async down(queryInterface) {
    if (await columnExists(queryInterface, "quotation_item", "color")) {
      await queryInterface.removeColumn("quotation_item", "color");
    }
    if (await columnExists(queryInterface, "quotation_item", "product_code")) {
      await queryInterface.removeColumn("quotation_item", "product_code");
    }
  },
};

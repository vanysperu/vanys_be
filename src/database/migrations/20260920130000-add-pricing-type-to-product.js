"use strict";

// Los productos ya no se cobran solo "por unidad" — algunos catálogos
// cotizan por lote de 100 (precio por ciento) o de 1000 (precio por
// millar), ej. tarjetas/volantes impresos. base_price pasa a significar
// "precio del lote" cuando pricing_type no es "unit" — ver
// computeProductQuantityPrice (grulla_be: quotation.service.ts).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("product", "pricing_type", {
      type: Sequelize.ENUM("unit", "hundred", "thousand"),
      allowNull: false,
      defaultValue: "unit",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("product", "pricing_type");
  },
};

"use strict";

// Cuarto nivel de precio de catálogo: "medio millar" (lote de 500
// unidades), entre "por ciento" (100) y "por millar" (1000).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("product", "price_half_thousand", {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("product", "price_half_thousand");
  },
};

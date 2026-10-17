"use strict";

// Cada item de cotización elige qué precio de catálogo del producto usar
// (unidad/ciento/millar) o si lleva un precio personalizado propio de esa
// cotización — ver QuotationItemPricingMode en quotation_item.model.ts.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("quotation_item", "pricing_mode", {
      type: Sequelize.ENUM("unit", "hundred", "thousand", "custom"),
      allowNull: false,
      defaultValue: "unit",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("quotation_item", "pricing_mode");
  },
};

"use strict";

// La técnica de personalización solo tenía un monto fijo único
// (extra_value), sin importar cuántas unidades se pedían — pedido
// explícito del usuario: "la personalización... también tiene diferentes
// montos como el producto" (ej. personalizar por millar cuesta menos por
// unidad que personalizar por unidad suelta). Se agregan las mismas 4
// columnas de precio por volumen que ya tiene "product" — solo aplican
// cuando extra_type="fixed"; "percentage" sigue usando extra_value tal
// cual (ya escala solo, es un % del precio base que varía por modo).
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("customization_technique", "price_unit", {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });
    await queryInterface.addColumn("customization_technique", "price_hundred", {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });
    await queryInterface.addColumn("customization_technique", "price_half_thousand", {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });
    await queryInterface.addColumn("customization_technique", "price_thousand", {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("customization_technique", "price_thousand");
    await queryInterface.removeColumn("customization_technique", "price_half_thousand");
    await queryInterface.removeColumn("customization_technique", "price_hundred");
    await queryInterface.removeColumn("customization_technique", "price_unit");
  },
};

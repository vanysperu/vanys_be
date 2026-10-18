"use strict";

const { columnExists } = require("../migration-helpers");

// Las técnicas de personalización pasan a funcionar EXACTAMENTE igual que los
// productos: solo 4 precios por volumen (unidad / ciento / medio millar /
// millar), y el precio de un item es
//   (precio del producto en ese modo + precio de la técnica en ese modo) × cantidad
// Pedido explícito del usuario, con su ejemplo: jabón ciento S/0.90 +
// serigrafía ciento S/0.95, 10 unidades = (0.90 + 0.95) × 10 = S/18.50.
//
// Se elimina el modo "porcentual" (extra_type/extra_value): la creación
// rápida desde la cotización lo usaba por defecto, así que la técnica se
// calculaba como un % del producto en vez de su propia tarifa.
//
// Una técnica que era porcentual y no tiene ningún precio por volumen queda
// sin precios: no se inventa uno (un "10%" no equivale a ningún monto en
// soles). Hasta que alguien le cargue precios, cotizarla avisa que falta el
// precio de la técnica para ese modo. Las cotizaciones ya creadas no cambian:
// guardan su precio unitario calculado en su momento.
module.exports = {
  async up(queryInterface) {
    if (await columnExists(queryInterface, "customization_technique", "extra_value")) {
      await queryInterface.removeColumn("customization_technique", "extra_value");
    }
    if (await columnExists(queryInterface, "customization_technique", "extra_type")) {
      await queryInterface.removeColumn("customization_technique", "extra_type");
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn("customization_technique", "extra_type", {
      type: Sequelize.ENUM("fixed", "percentage"),
      allowNull: false,
      defaultValue: "fixed",
    });
    await queryInterface.addColumn("customization_technique", "extra_value", {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    });
  },
};

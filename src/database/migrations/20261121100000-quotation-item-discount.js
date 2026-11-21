"use strict";

const { columnExists } = require("../migration-helpers");

// Descuentos por producto en la cotización (pedido del usuario, 21-nov):
// - percent: "20% de descuento" sobre el precio unitario;
// - final_price: "que quede en S/ X" por unidad (el sistema calcula el descuento).
// `unit_price` SIGUE siendo el precio final (ya con descuento) y `subtotal`
// = unit_price × cantidad: totales, IGV, estadísticas y ganancia no cambian.
// `list_unit_price` guarda el precio ANTES del descuento (null = sin descuento).
module.exports = {
  async up(queryInterface) {
    if (await columnExists(queryInterface, "quotation_item", "discount_type")) return;
    await queryInterface.sequelize.query(
      `ALTER TABLE quotation_item
       ADD COLUMN discount_type ENUM('percent','final_price') NULL AFTER unit_price,
       ADD COLUMN discount_value DECIMAL(10,2) NULL AFTER discount_type,
       ADD COLUMN list_unit_price DECIMAL(10,2) NULL AFTER discount_value`
    );
  },

  async down(queryInterface) {
    if (!(await columnExists(queryInterface, "quotation_item", "discount_type"))) return;
    await queryInterface.sequelize.query(
      "ALTER TABLE quotation_item DROP COLUMN list_unit_price, DROP COLUMN discount_value, DROP COLUMN discount_type"
    );
  },
};

"use strict";

const { columnExists } = require("../migration-helpers");

// "Requiere personalización" por producto (pedido explícito del usuario:
// "muchos productos no requieren personalizado"). Si está apagado, el
// producto se cotiza sin técnica de personalización (ni selector en la
// cotización, ni técnica en el PDF).
//
// - Productos NUEVOS: apagado por defecto (decisión del usuario).
// - Productos que ya existían: se encienden, porque hasta hoy toda
//   cotización exigía técnica — así nada cambia sin que alguien lo decida.
module.exports = {
  async up(queryInterface, Sequelize) {
    if (await columnExists(queryInterface, "product", "requires_customization")) return;

    await queryInterface.addColumn("product", "requires_customization", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.sequelize.query("UPDATE product SET requires_customization = true");
  },

  async down(queryInterface) {
    if (!(await columnExists(queryInterface, "product", "requires_customization"))) return;
    await queryInterface.removeColumn("product", "requires_customization");
  },
};

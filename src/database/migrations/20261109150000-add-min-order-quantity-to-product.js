"use strict";

const { columnExists } = require("../migration-helpers");

// Pedido explícito del usuario: cada producto puede tener un pedido mínimo
// (la menor cantidad que se puede pedir). NULL = sin mínimo, así los productos
// que ya existen quedan igual y la migración no falla con datos previos.
// Es informativo: la cotización no lo bloquea y un pedido de la web por debajo
// del mínimo se recibe igual y queda marcado.
module.exports = {
  async up(queryInterface, Sequelize) {
    if (await columnExists(queryInterface, "product", "min_order_quantity")) return;
    await queryInterface.addColumn("product", "min_order_quantity", {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface) {
    if (!(await columnExists(queryInterface, "product", "min_order_quantity"))) return;
    await queryInterface.removeColumn("product", "min_order_quantity");
  },
};

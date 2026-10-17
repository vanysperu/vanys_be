"use strict";

// Una orden de compra puede tener varios productos y no todos se consiguen
// al mismo tiempo ni en el mismo lugar — cada producto de la orden necesita
// su propio estado (pedido explícito del usuario). "not_needed" es la
// salida flexible pero controlada: si un producto de la orden deja de
// hacer falta, se marca así en vez de forzar comprarlo para poder cerrar
// la orden completa.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("purchase_order_item", "status", {
      type: Sequelize.ENUM("pending", "purchased", "not_needed"),
      allowNull: false,
      defaultValue: "pending",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("purchase_order_item", "status");
  },
};

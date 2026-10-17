"use strict";

// Los pagos que no son en efectivo (yape/plin/transferencia/tarjeta/etc.)
// necesitan un número de operación para poder conciliarlos después —
// pedido explícito del usuario.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("quotation_payment", "operation_number", {
      type: Sequelize.STRING(50),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("quotation_payment", "operation_number");
  },
};

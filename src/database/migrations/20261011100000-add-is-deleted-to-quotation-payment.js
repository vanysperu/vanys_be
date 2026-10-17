"use strict";

// El módulo "payment" (nuevo) necesita poder anular un pago sin borrar el
// registro histórico — mismo patrón soft-delete que cash_movement/client/
// product. recalculateTotalPaid (quotation_payment.service.ts) se actualiza
// en el mismo cambio para excluir los pagos anulados de la suma.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("quotation_payment", "is_deleted", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("quotation_payment", "is_deleted");
  },
};

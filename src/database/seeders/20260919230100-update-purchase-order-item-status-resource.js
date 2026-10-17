"use strict";

// La orden de compra ya no se marca "comprada" de un solo golpe — cada
// producto de la orden tiene su propio estado (pending/purchased/
// not_needed) y la orden se cierra sola cuando ya no queda ninguno
// pendiente (ver purchase_order_item.service.ts). El resource que ya
// existía para "marcar comprada" (id 92) se actualiza para apuntar a la
// nueva ruta en vez de crear uno nuevo y dejar el viejo huérfano.
module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkUpdate(
      "resources",
      {
        code: "purchase_order.item.updateStatus.button",
        name: "Actualizar estado de producto de la orden",
        route: "/purchase-order/item/*/status",
      },
      { id: 92 }
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkUpdate(
      "resources",
      {
        code: "purchase_order.markPurchased.button",
        name: "Marcar como comprada",
        route: "/purchase-order/mark-purchased/*",
      },
      { id: 92 }
    );
  },
};

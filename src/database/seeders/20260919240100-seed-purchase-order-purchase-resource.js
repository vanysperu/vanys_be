"use strict";

// Registrar una compra parcial de un item (con monto) es una acción nueva,
// separada de "actualizar estado" (que ahora solo permite pending/
// not_needed) — mismos roles que ya tenían acceso a tocar items de una
// orden de compra (Administrador + Especialista, ver 20260919220100).
const now = new Date();

const resourceRow = {
  id: 96,
  module_id: 10,
  parent_id: 90,
  type: "button",
  code: "purchase_order.item.registerPurchase.button",
  name: "Registrar compra de producto",
  description: null,
  route: "/purchase-order/item/*/purchases",
  verb: "POST",
  icon: null,
  show_in_menu: true,
  position: 96,
  active: true,
  created_at: now,
};

const ROLE_IDS = [2, 3, 4, 5]; // Administrador (2,4,5) + Especialista (3)

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert("resources", [resourceRow]);
    await queryInterface.bulkInsert(
      "roles_resources",
      ROLE_IDS.map((role_id) => ({ role_id, resource_id: resourceRow.id, created_at: now })),
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("roles_resources", { resource_id: resourceRow.id });
    await queryInterface.bulkDelete("resources", { id: resourceRow.id });
  },
};

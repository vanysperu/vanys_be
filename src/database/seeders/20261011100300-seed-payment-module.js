"use strict";

// Convierte "pagos" en un módulo RBAC completo (pedido explícito del
// usuario: "crea el modulo de pago bien completo"). El alta de un pago
// sigue viviendo en /quotation/:id/payments (resource ya existente
// "cotizacion.payment.create.button", id 77 — no se duplica), pero ahora
// hay una vista propia para listar TODOS los pagos de la empresa, editarlos
// y anularlos.
const now = new Date();

const modules = [
  {
    id: 13,
    code: "payment",
    name: "Pagos",
    description: "Listado, edición y anulación de los pagos registrados en las cotizaciones",
    icon: "credit-card",
    position: 13,
    active: true,
    created_at: now,
  },
];

// [id, module_id, parent_id, type, code, name, route, verb, showInMenu, icon]
const resourceRows = [
  [151, 13, null, "view", "payment.list", "Pagos", "/pagos", null, true, "credit-card"],
  [152, 13, 151, "button", "payment.update.button", "Editar pago", "/payment/update/*", "PUT", true],
  [153, 13, 151, "button", "payment.disable.button", "Anular/restaurar pago", "/payment/disable/*", "PUT", true],
  [154, 13, 151, "endpoint", "payment.list.endpoint", "Listar pagos (API)", "/payment/list", "GET", true],
];

const resources = resourceRows.map(([id, module_id, parent_id, type, code, name, route, verb, show_in_menu, icon]) => ({
  id,
  module_id,
  parent_id,
  type,
  code,
  name,
  description: null,
  route,
  verb,
  icon: icon ?? null,
  show_in_menu,
  position: id,
  active: true,
  created_at: now,
}));

// Administrador (plantilla, id 2) puede ver/editar/anular todo. Gestor
// (id 6) solo puede VER el listado (ya puede crear pagos vía el resource de
// cotizacion existente) — mismo criterio que cash_movement: Gestor nunca
// recibe el botón de anular.
const ADMIN_ONLY_CODES = ["payment.update.button", "payment.disable.button"];
const GESTOR_ROLE_ID = 6;
const ADMIN_ROLE_ID = 2;

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert("modules", modules);
    await queryInterface.bulkInsert("resources", resources);

    const adminGrants = resources.map((resource) => ({
      role_id: ADMIN_ROLE_ID,
      resource_id: resource.id,
      created_at: now,
    }));
    const gestorGrants = resources
      .filter((resource) => !ADMIN_ONLY_CODES.includes(resource.code))
      .map((resource) => ({ role_id: GESTOR_ROLE_ID, resource_id: resource.id, created_at: now }));

    await queryInterface.bulkInsert("roles_resources", [...adminGrants, ...gestorGrants]);
  },

  async down(queryInterface) {
    const resourceIds = resourceRows.map((row) => row[0]);
    await queryInterface.bulkDelete("roles_resources", { resource_id: resourceIds });
    await queryInterface.bulkDelete("resources", { module_id: [13] });
    await queryInterface.bulkDelete("modules", { id: [13] });
  },
};

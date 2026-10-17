"use strict";

// Módulo "¿a quién se le debe y cuánto?" (pedido explícito del usuario) —
// solo visible para el Administrador de la empresa: es una vista financiera
// de gestión, no una tarea operativa del día a día de un Gestor.
const now = new Date();

const modules = [
  {
    id: 14,
    code: "employee_debt",
    name: "Deudas a personal",
    description: "Dinero propio que un trabajador adelantó en una compra y la empresa aún le debe",
    icon: "hand-coins",
    position: 14,
    active: true,
    created_at: now,
  },
];

// [id, module_id, parent_id, type, code, name, route, verb, showInMenu, icon]
const resourceRows = [
  [155, 14, null, "view", "employee_debt.list", "Deudas a personal", "/deudas-personal", null, true, "hand-coins"],
  [156, 14, 155, "button", "employee_debt.pay.button", "Marcar deuda como pagada", "/employee-debt/pay/*", "PUT", true],
  [157, 14, 155, "endpoint", "employee_debt.list.endpoint", "Listar deudas (API)", "/employee-debt/list", "GET", true],
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

const ADMIN_ROLE_ID = 2;

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert("modules", modules);
    await queryInterface.bulkInsert("resources", resources);

    await queryInterface.bulkInsert(
      "roles_resources",
      resources.map((resource) => ({ role_id: ADMIN_ROLE_ID, resource_id: resource.id, created_at: now }))
    );
  },

  async down(queryInterface) {
    const resourceIds = resourceRows.map((row) => row[0]);
    await queryInterface.bulkDelete("roles_resources", { resource_id: resourceIds });
    await queryInterface.bulkDelete("resources", { module_id: [14] });
    await queryInterface.bulkDelete("modules", { id: [14] });
  },
};

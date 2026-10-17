"use strict";

// RBAC para lo que pide el flujo de kanban/pagos/gastos/timeline de
// cotizaciones (ver conversación): etapas de producción configurables por
// empresa (módulo nuevo) + 3 acciones nuevas dentro del módulo cotización
// ya existente (mover etapa de un item, registrar pago, registrar gasto).
const now = new Date();

const modules = [
  {
    id: 8,
    code: "etapa_produccion",
    name: "Etapas de producción",
    description: "Etapas configurables por empresa para el mini-kanban de productos de una cotización",
    icon: "flag",
    position: 8,
    active: true,
    created_at: now,
  },
];

// [id, module_id, parent_id, type, code, name, route, verb, show_in_menu, icon]
const resourceRows = [
  // ---- Módulo 8: etapa_produccion ----
  [80, 8, null, "view", "etapa_produccion.list", "Etapas de producción", "/etapas-produccion", null, true, "flag"],
  [81, 8, 80, "button", "etapa_produccion.create.button", "Crear etapa", "/production-stage/create", "POST", true],
  [82, 8, 80, "button", "etapa_produccion.update.button", "Actualizar etapa", "/production-stage/update/*", "PUT", true],
  [83, 8, 80, "button", "etapa_produccion.disable.button", "Deshabilitar etapa", "/production-stage/disable/*", "PUT", true],
  [84, 8, 80, "endpoint", "etapa_produccion.list.endpoint", "Listar etapas (API)", "/production-stage/list", "GET", true],

  // ---- Módulo 7: cotizacion (acciones nuevas del flujo pago/gasto/kanban) ----
  [76, 7, 70, "button", "cotizacion.item.changeStage.button", "Mover producto de etapa", "/quotation/item/*/stage", "PUT", true],
  [77, 7, 70, "button", "cotizacion.payment.create.button", "Registrar pago", "/quotation/*/payments", "POST", true],
  [78, 7, 70, "button", "cotizacion.expense.create.button", "Registrar gasto", "/quotation/*/expenses", "POST", true],
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

// Mismos roles que ya tenían el módulo cotización (seeder crm-modules):
// Administrador de empresa: todo. Especialista: mover etapa de producto sí
// (es quien ejecuta producción), pero no pagos/gastos (eso es de admin).
const ADMIN_ROLE_IDS = [2, 4, 5];
const SPECIALIST_ROLE_IDS = [3];
const SPECIALIST_RESOURCE_IDS = [76];

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert("modules", modules);
    await queryInterface.bulkInsert("resources", resources);

    const allResourceIds = resources.map((resource) => resource.id);
    const adminGrants = ADMIN_ROLE_IDS.flatMap((role_id) =>
      allResourceIds.map((resource_id) => ({ role_id, resource_id, created_at: now })),
    );
    const specialistGrants = SPECIALIST_ROLE_IDS.flatMap((role_id) =>
      SPECIALIST_RESOURCE_IDS.map((resource_id) => ({ role_id, resource_id, created_at: now })),
    );

    await queryInterface.bulkInsert("roles_resources", [...adminGrants, ...specialistGrants]);
  },

  async down(queryInterface) {
    const resourceIds = resourceRows.map((row) => row[0]);
    await queryInterface.bulkDelete("roles_resources", { resource_id: resourceIds });
    await queryInterface.bulkDelete("resources", { id: resourceIds });
    await queryInterface.bulkDelete("modules", { id: [8] });
  },
};

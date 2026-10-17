"use strict";

// Catálogo global "cash_movement_type" (categoría "para qué" del
// movimiento, distinta de "payment_method" que ya existe para el MÉTODO de
// pago) + RBAC del módulo "Caja" — pedido explícito del usuario. Una
// empresa puede agregar sus propias categorías desde "Variables Generales"
// (mismo patrón que production_stage/payment_method).
const now = new Date();

const CASH_MOVEMENT_TYPES = [
  { prefix_id: "otro_ingreso", name: "Otro ingreso" },
  { prefix_id: "aporte_capital", name: "Aporte de capital" },
  { prefix_id: "compra_insumos", name: "Compra de insumos" },
  { prefix_id: "pago_servicios", name: "Pago de servicios" },
  { prefix_id: "sueldo", name: "Sueldo/planilla" },
  { prefix_id: "alquiler", name: "Alquiler" },
  { prefix_id: "otro_egreso", name: "Otro egreso" },
];

const variableRows = CASH_MOVEMENT_TYPES.map((item, index) => ({
  category: "cash_movement_type",
  title: "Tipo de movimiento de caja",
  prefix_id: item.prefix_id,
  name: item.name,
  description: "",
  ref1: null,
  ref2: String(index),
  company_id: null,
  is_deleted: false,
  created_at: now,
}));

const modules = [
  {
    id: 12,
    code: "cash_movement",
    name: "Caja",
    description: "Ingresos y salidas de dinero — pagos de cotizaciones, gastos y movimientos manuales",
    icon: "wallet",
    position: 12,
    active: true,
    created_at: now,
  },
];

// [id, module_id, parent_id, type, code, name, route, verb, showInMenu, icon]
const resourceRows = [
  [140, 12, null, "view", "cash_movement.list", "Caja", "/caja", null, true, "wallet"],
  [141, 12, 140, "button", "cash_movement.create.button", "Registrar movimiento", "/cash-movement/create", "POST", true],
  [142, 12, 140, "button", "cash_movement.disable.button", "Deshabilitar movimiento", "/cash-movement/disable/*", "PUT", true],
  [143, 12, 140, "endpoint", "cash_movement.list.endpoint", "Listar movimientos (API)", "/cash-movement/list", "GET", true],
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

// Rol base "Administrador" (id 2, company_id NULL — plantilla, no un rol de
// una empresa puntual) recibe el módulo completo. Los roles propios de cada
// empresa (ej. "Administrador de Acme Corp") se otorgan después desde
// "Roles y accesos" (Gestionar accesos) — no se hardcodean acá IDs de
// empresas de prueba que pueden no existir en otro entorno.
const ADMIN_ROLE_IDS = [2];

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert("general_variable", variableRows);
    await queryInterface.bulkInsert("modules", modules);
    await queryInterface.bulkInsert("resources", resources);

    const allResourceIds = resources.map((resource) => resource.id);
    const adminGrants = ADMIN_ROLE_IDS.flatMap((role_id) =>
      allResourceIds.map((resource_id) => ({ role_id, resource_id, created_at: now })),
    );
    await queryInterface.bulkInsert("roles_resources", adminGrants);
  },

  async down(queryInterface) {
    const resourceIds = resourceRows.map((row) => row[0]);
    await queryInterface.bulkDelete("roles_resources", { resource_id: resourceIds });
    await queryInterface.bulkDelete("resources", { module_id: [12] });
    await queryInterface.bulkDelete("modules", { id: [12] });
    await queryInterface.bulkDelete("general_variable", { category: "cash_movement_type", company_id: null });
  },
};

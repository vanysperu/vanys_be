"use strict";

// RBAC del nuevo módulo "Órdenes de compra" (Inicio: asignar a alguien la
// compra de productos de una cotización). Administrador crea/asigna;
// Especialista (o cualquier rol no-admin) solo necesita poder LISTAR sus
// propias órdenes asignadas (?assignedToMe=1, sin filtro de tenant extra
// porque ya es "las suyas") y marcarlas como compradas — nunca crear ni ver
// las de toda la empresa.
const now = new Date();

const modules = [
  {
    id: 10,
    code: "purchase_order",
    name: "Órdenes de compra",
    description: "Asignar a alguien la compra de productos de una cotización",
    icon: "shopping-cart",
    position: 10,
    active: true,
    created_at: now,
  },
];

// [id, module_id, parent_id, type, code, name, route, verb, show_in_menu, icon]
const resourceRows = [
  [90, 10, null, "view", "purchase_order.list", "Órdenes de compra", "/ordenes-compra", null, true, "shopping-cart"],
  [91, 10, 90, "button", "purchase_order.create.button", "Crear orden de compra", "/purchase-order/create", "POST", true],
  [92, 10, 90, "button", "purchase_order.item.updateStatus.button", "Actualizar estado de producto de la orden", "/purchase-order/item/*/status", "PUT", true],
  [93, 10, 90, "endpoint", "purchase_order.list.endpoint", "Listar órdenes de compra (API)", "/purchase-order/list", "GET", true],
  [94, 10, 90, "endpoint", "purchase_order.find.endpoint", "Buscar orden de compra por ID (API)", "/purchase-order/find/*", "GET", true],
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

const ADMIN_ROLE_IDS = [2, 4, 5];
// Todos los roles no-admin (Especialista) igual necesitan poder ver "mis
// órdenes" y marcarlas compradas — cualquiera puede ser el asignado.
const ALL_NON_ADMIN_ROLE_IDS = [3];
const NON_ADMIN_RESOURCE_IDS = [90, 92, 93, 94]; // todo menos crear

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert("modules", modules);
    await queryInterface.bulkInsert("resources", resources);

    const allResourceIds = resources.map((resource) => resource.id);
    const adminGrants = ADMIN_ROLE_IDS.flatMap((role_id) =>
      allResourceIds.map((resource_id) => ({ role_id, resource_id, created_at: now })),
    );
    const nonAdminGrants = ALL_NON_ADMIN_ROLE_IDS.flatMap((role_id) =>
      NON_ADMIN_RESOURCE_IDS.map((resource_id) => ({ role_id, resource_id, created_at: now })),
    );

    await queryInterface.bulkInsert("roles_resources", [...adminGrants, ...nonAdminGrants]);
  },

  async down(queryInterface) {
    const resourceIds = resourceRows.map((row) => row[0]);
    await queryInterface.bulkDelete("roles_resources", { resource_id: resourceIds });
    await queryInterface.bulkDelete("resources", { id: resourceIds });
    await queryInterface.bulkDelete("modules", { id: 10 });
  },
};

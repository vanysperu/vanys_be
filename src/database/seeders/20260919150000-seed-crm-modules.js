"use strict";

// RBAC para los 3 módulos del primer avance del flujo de negocio (Vanys):
// Cliente, Producto (+ técnicas de personalización) y Cotización. Alcance
// acordado con el usuario: por ahora solo estos 3, Finanzas/Reportes/
// Impuestos quedan para después.
const now = new Date();

const modules = [
  { id: 5, code: "cliente", name: "Clientes", description: "Datos de contacto e historial de cotizaciones", icon: "profile-user", position: 5, active: true, created_at: now },
  { id: 6, code: "producto", name: "Productos", description: "Catálogo de productos base y técnicas de personalización", icon: "box", position: 6, active: true, created_at: now },
  { id: 7, code: "cotizacion", name: "Cotizaciones", description: "Cotizaciones: flujo completo pendiente -> ... -> finalizada", icon: "document", position: 7, active: true, created_at: now },
];

// [id, module_id, parent_id, type, code, name, route, verb, show_in_menu, icon]
// El ícono solo se llena en las filas tipo "view" que aparecen en el menú
// (botones/endpoints no se muestran en el sidebar, así que no lo necesitan)
// — nombres tomados de src/lib/resolveIcon.ts del frontend (grulla_fe).
const resourceRows = [
  // ---- Módulo 5: cliente ----
  [50, 5, null, "view", "cliente.list", "Clientes", "/clientes", null, true, "profile-user"],
  [51, 5, 50, "button", "cliente.create.button", "Crear cliente", "/client/create", "POST", true],
  [52, 5, 50, "button", "cliente.update.button", "Actualizar cliente", "/client/update/*", "PUT", true],
  [53, 5, 50, "button", "cliente.disable.button", "Deshabilitar cliente", "/client/disable/*", "PUT", true],
  [54, 5, 50, "endpoint", "cliente.list.endpoint", "Listar clientes (API)", "/client/list", "GET", true],

  // ---- Módulo 6: producto ----
  [60, 6, null, "view", "producto.list", "Productos", "/productos", null, true, "box"],
  [61, 6, 60, "button", "producto.create.button", "Crear producto", "/product/create", "POST", true],
  [62, 6, 60, "button", "producto.update.button", "Actualizar producto", "/product/update/*", "PUT", true],
  [63, 6, 60, "button", "producto.disable.button", "Deshabilitar producto", "/product/disable/*", "PUT", true],
  [64, 6, 60, "endpoint", "producto.list.endpoint", "Listar productos (API)", "/product/list", "GET", true],
  [65, 6, 60, "view", "producto.technique.list", "Técnicas de personalización", "/productos/tecnicas", null, true, "color-swatch"],
  [66, 6, 65, "button", "producto.technique.create.button", "Crear técnica", "/customization-technique/create", "POST", true],
  [67, 6, 65, "button", "producto.technique.update.button", "Actualizar técnica", "/customization-technique/update/*", "PUT", true],
  [68, 6, 65, "button", "producto.technique.disable.button", "Deshabilitar técnica", "/customization-technique/disable/*", "PUT", true],
  [69, 6, 65, "endpoint", "producto.technique.list.endpoint", "Listar técnicas (API)", "/customization-technique/list", "GET", true],

  // ---- Módulo 7: cotizacion ----
  [70, 7, null, "view", "cotizacion.list", "Cotizaciones", "/cotizaciones", null, true, "document"],
  [71, 7, 70, "button", "cotizacion.create.button", "Crear cotización", "/quotation/create", "POST", true],
  [72, 7, 70, "button", "cotizacion.update.button", "Actualizar cotización", "/quotation/update/*", "PUT", true],
  [73, 7, 70, "button", "cotizacion.changeStatus.button", "Cambiar estado de cotización", "/quotation/status/*", "PUT", true],
  [74, 7, 70, "endpoint", "cotizacion.list.endpoint", "Listar cotizaciones (API)", "/quotation/list", "GET", true],
  [75, 7, 70, "endpoint", "cotizacion.find.endpoint", "Buscar cotización por ID (API)", "/quotation/find/*", "GET", true],
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

// Administrador (empresa): CRUD completo de los 3 módulos, scoped a su
// propia empresa por el controller (mismo patrón que business_unit).
const ADMIN_ROLE_IDS = [2, 4, 5];
// Especialista: por ahora solo lectura + mover el estado de una cotización
// (es quien ejecuta diseño/producción, pasos 4-5 del flujo) — sin crear ni
// deshabilitar clientes/productos. Ajustable más adelante si no calza.
const SPECIALIST_ROLE_IDS = [3];
const SPECIALIST_RESOURCE_IDS = [50, 54, 60, 64, 65, 69, 70, 73, 74, 75];

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
    await queryInterface.bulkDelete("resources", { module_id: [5, 6, 7] });
    await queryInterface.bulkDelete("modules", { id: [5, 6, 7] });
  },
};

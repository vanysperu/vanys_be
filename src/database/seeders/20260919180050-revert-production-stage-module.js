"use strict";

// Revierte el seeder 20260919160000: las etapas de producción dejan de ser
// un módulo/pantalla propios del RBAC — se gestionan como filas de
// general_variable dentro de la pantalla ya existente "Variables Generales"
// (mismo módulo/permiso que el resto de catálogos). La acción de mover un
// producto de etapa (resource 76, dentro del módulo "cotizacion") se queda,
// eso sigue siendo una acción del flujo de cotización, no de configuración.
const REMOVED_RESOURCE_IDS = [80, 81, 82, 83, 84];
const REMOVED_MODULE_ID = 8;

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkDelete("roles_resources", { resource_id: REMOVED_RESOURCE_IDS });
    await queryInterface.bulkDelete("resources", { id: REMOVED_RESOURCE_IDS });
    await queryInterface.bulkDelete("modules", { id: REMOVED_MODULE_ID });
  },

  async down(queryInterface) {
    const now = new Date();
    await queryInterface.bulkInsert("modules", [
      {
        id: REMOVED_MODULE_ID,
        code: "etapa_produccion",
        name: "Etapas de producción",
        description: "Etapas configurables por empresa para el mini-kanban de productos de una cotización",
        icon: "flag",
        position: 8,
        active: true,
        created_at: now,
      },
    ]);
    await queryInterface.bulkInsert("resources", [
      { id: 80, module_id: 8, parent_id: null, type: "view", code: "etapa_produccion.list", name: "Etapas de producción", description: null, route: "/etapas-produccion", verb: null, icon: "flag", show_in_menu: true, position: 80, active: true, created_at: now },
      { id: 81, module_id: 8, parent_id: 80, type: "button", code: "etapa_produccion.create.button", name: "Crear etapa", description: null, route: "/production-stage/create", verb: "POST", icon: null, show_in_menu: true, position: 81, active: true, created_at: now },
      { id: 82, module_id: 8, parent_id: 80, type: "button", code: "etapa_produccion.update.button", name: "Actualizar etapa", description: null, route: "/production-stage/update/*", verb: "PUT", icon: null, show_in_menu: true, position: 82, active: true, created_at: now },
      { id: 83, module_id: 8, parent_id: 80, type: "button", code: "etapa_produccion.disable.button", name: "Deshabilitar etapa", description: null, route: "/production-stage/disable/*", verb: "PUT", icon: null, show_in_menu: true, position: 83, active: true, created_at: now },
      { id: 84, module_id: 8, parent_id: 80, type: "endpoint", code: "etapa_produccion.list.endpoint", name: "Listar etapas (API)", description: null, route: "/production-stage/list", verb: "GET", icon: null, show_in_menu: true, position: 84, active: true, created_at: now },
    ]);
  },
};

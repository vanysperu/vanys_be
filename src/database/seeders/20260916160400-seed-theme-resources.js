"use strict";

// Registra en el catálogo RBAC (sección 2 del CLAUDE.md) el endpoint de
// catálogo de paletas y la vista de frontend de "Apariencia de empresas",
// bajo el módulo de plataforma (id 4) ya usado para la gestión de empresas
// (mismo nivel de acceso: solo is_system, igual que /company/update).

const now = new Date();

const resourceRows = [
  [40, 4, null, "endpoint", "platform.theme.list.endpoint", "Listar paletas de marca (API)", "/theme/list", "GET"],
  [41, 4, null, "view", "platform.company.theme.view", "Apariencia de empresas", "/configuracion/apariencia-empresas", "GET"],
];

const resources = resourceRows.map(([id, module_id, parent_id, type, code, name, route, verb]) => ({
  id,
  module_id,
  parent_id,
  type,
  code,
  name,
  description: null,
  route,
  verb: type === "view" ? null : verb,
  // "building" en vez de "color-swatch": esta vista lista EMPRESAS (no
  // paletas), color-swatch quedó reservado para "Técnicas de personalización"
  // del módulo producto, para no repetir el mismo ícono en dos vistas.
  icon: type === "view" ? "building" : null,
  show_in_menu: type === "view",
  position: id,
  active: true,
  created_at: now,
}));

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert("resources", resources);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("resources", { module_id: 4, id: [40, 41] });
  },
};

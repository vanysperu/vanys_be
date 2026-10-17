"use strict";

// Bug de datos encontrado al probar el sistema con un usuario NO is_system:
// el rol "Administrador" (id 2) y "Especialista" (id 3) nunca tuvieron NINGÚN
// recurso otorgado en roles_resources desde que se sembró el proyecto — solo
// "Super Administrador" (is_system) funcionaba de verdad. Esto los deja
// utilizables como roles reales de una empresa.
//
// Administrador: gestiona usuarios, roles propios de su empresa (crear/
// editar/deshabilitar rol + asignar accesos) y variables generales. NO se le
// da alta de módulos/recursos (17-25) ni nada de la plataforma (módulo 4) —
// eso sigue siendo exclusivo de is_system.
//
// Especialista: solo lectura de usuarios y variables generales.
const ADMINISTRADOR_RESOURCE_IDS = [
  // Usuarios (módulo 1): todo
  1, 2, 3, 4, 5, 6, 7, 8, 9,
  // Roles y Accesos (módulo 2): rol propio + asignar accesos, sin catálogo módulos/recursos
  10, 11, 12, 13, 14, 15, 16,
  // Variables generales (módulo 3): todo
  26, 27, 28, 29, 30, 31,
];

const ESPECIALISTA_RESOURCE_IDS = [
  // Usuarios: solo ver
  1, 6, 7, 8,
  // Variables generales: solo ver
  26, 30, 31,
];

const buildRows = (roleId, resourceIds) =>
  resourceIds.map((resourceId) => ({ role_id: roleId, resource_id: resourceId, created_by: null, created_at: new Date() }));

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert("roles_resources", [
      ...buildRows(2, ADMINISTRADOR_RESOURCE_IDS),
      ...buildRows(3, ESPECIALISTA_RESOURCE_IDS),
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("roles_resources", { role_id: [2, 3] });
  },
};

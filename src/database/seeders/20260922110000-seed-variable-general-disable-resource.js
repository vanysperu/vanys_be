"use strict";

// Registra el nuevo endpoint/botón de "deshabilitar" (soft-delete, PUT
// /variable_general/disable/:id) que reemplaza al DELETE físico anterior
// (resource 29, "variable_general.delete.button"). Se agrega como recurso
// NUEVO (no se reescribe el 29, que puede seguir referenciado por tokens ya
// emitidos) y se otorga a los mismos roles de empresa que ya tenían acceso
// a eliminar (ver 20260919190000-restore-variable-general-for-company-admins.js).
// Los ids 4 y 5 (de la lista original [2, 4, 5]) eran roles propios de
// empresas de prueba ya borradas en una limpieza posterior — hoy solo el 2
// (Administrador) tiene de verdad "variable_general.update.button"
// otorgado (ver roles_resources), así que este nuevo botón de deshabilitar
// se le otorga a ese mismo conjunto real, no al histórico.
const ADMIN_ROLE_IDS = [2];
// 101 ya lo tenía tomado "cotizacion.pdf.endpoint" (creado por otro seeder
// con timestamp posterior) — este archivo nunca llegó a correr hasta ahora
// (no figuraba en SequelizeData), así que recién se detectó el choque al
// ejecutarlo. 150 está libre (máximo id de "resources" en uso: 143).
const RESOURCE_ID = 150;
const MODULE_ID = 3; // variable_general
const PARENT_VIEW_ID = 26; // variable_general.list

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    await queryInterface.bulkInsert("resources", [
      {
        id: RESOURCE_ID,
        module_id: MODULE_ID,
        parent_id: PARENT_VIEW_ID,
        type: "button",
        code: "variable_general.disable.button",
        name: "Deshabilitar variable general",
        description: null,
        route: "/variable_general/disable/*",
        verb: "PUT",
        icon: null,
        show_in_menu: true,
        position: RESOURCE_ID,
        active: true,
        created_at: now,
      },
    ]);

    const grants = ADMIN_ROLE_IDS.map((role_id) => ({ role_id, resource_id: RESOURCE_ID, created_at: now }));
    await queryInterface.bulkInsert("roles_resources", grants);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("roles_resources", {
      role_id: ADMIN_ROLE_IDS,
      resource_id: RESOURCE_ID,
    });
    await queryInterface.bulkDelete("resources", { id: RESOURCE_ID });
  },
};

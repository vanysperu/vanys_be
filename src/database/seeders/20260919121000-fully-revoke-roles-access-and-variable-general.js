"use strict";

// Corrige la seeder anterior (20260919120000): esa solo quitó las vistas
// (resources 10 y 26), pero los roles seguían con TODOS los botones y
// endpoints de "roles_access" y "variable_general" otorgados —
// verificado con una consulta directa a roles_resources tras aplicarla.
// Ahora sí se revoca el módulo completo para los roles de empresa.
const ADMIN_ROLE_IDS = [2, 4, 5];
const SPECIALIST_ROLE_IDS = [3];

// Todo lo que queda del módulo 2 (roles_access) y 3 (variable_general),
// sin contar 10/26 (ya revocados por la seeder anterior).
const ROLES_ACCESS_RESOURCE_IDS = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
const VARIABLE_GENERAL_RESOURCE_IDS = [27, 28, 29, 30, 31];

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkDelete("roles_resources", {
      role_id: ADMIN_ROLE_IDS,
      resource_id: [...ROLES_ACCESS_RESOURCE_IDS, ...VARIABLE_GENERAL_RESOURCE_IDS],
    });
    await queryInterface.bulkDelete("roles_resources", {
      role_id: SPECIALIST_ROLE_IDS,
      resource_id: VARIABLE_GENERAL_RESOURCE_IDS,
    });
  },

  async down(queryInterface) {
    const now = new Date();
    const grants = [
      ...ADMIN_ROLE_IDS.flatMap((role_id) =>
        [...ROLES_ACCESS_RESOURCE_IDS, ...VARIABLE_GENERAL_RESOURCE_IDS].map((resource_id) => ({
          role_id,
          resource_id,
          created_at: now,
        })),
      ),
      ...SPECIALIST_ROLE_IDS.flatMap((role_id) =>
        VARIABLE_GENERAL_RESOURCE_IDS.map((resource_id) => ({ role_id, resource_id, created_at: now })),
      ),
    ];
    await queryInterface.bulkInsert("roles_resources", grants);
  },
};

"use strict";

// Ajuste de negocio: "roles_access" (roles/permisos) y "variable_general"
// (catálogos compartidos) quedan exclusivos de is_system — ningún admin de
// empresa debe poder tocar el RBAC ni los catálogos globales. A cambio, un
// admin de empresa SÍ gestiona las tiendas de su propia empresa (antes solo
// podía listarlas vía endpoint, sin vista ni botones).
//
// Roles afectados: los 3 "Administrador" (ids 2, 4, 5) y el "Especialista"
// (id 3) — verificados en vivo vía GET /roles/:id/resources antes de escribir
// esto (ver conversación). No toca los roles is_system (Super Administrador).
const ADMIN_ROLE_IDS = [2, 4, 5];
const SPECIALIST_ROLE_IDS = [3];

// resources.id ya sembrados:
// 10 = roles_access.list (view)
// 26 = variable_general.list (view)
// 37/38/39 = platform.businessUnit.create/update/disable (button, ex-endpoint)
// 42 = platform.businessUnit.view (view, "/configuracion/tiendas")
const REVOKE_FROM_ADMIN_AND_SPECIALIST = [26]; // variable_general.list
const REVOKE_FROM_ADMIN_ONLY = [10]; // roles_access.list
const GRANT_TO_ADMIN_ONLY = [42, 37, 38, 39]; // tiendas: vista + botones

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    await queryInterface.bulkDelete("roles_resources", {
      role_id: [...ADMIN_ROLE_IDS, ...SPECIALIST_ROLE_IDS],
      resource_id: REVOKE_FROM_ADMIN_AND_SPECIALIST,
    });
    await queryInterface.bulkDelete("roles_resources", {
      role_id: ADMIN_ROLE_IDS,
      resource_id: REVOKE_FROM_ADMIN_ONLY,
    });

    const grants = ADMIN_ROLE_IDS.flatMap((role_id) =>
      GRANT_TO_ADMIN_ONLY.map((resource_id) => ({ role_id, resource_id, created_at: now })),
    );
    await queryInterface.bulkInsert("roles_resources", grants);
  },

  async down(queryInterface) {
    const now = new Date();

    await queryInterface.bulkDelete("roles_resources", {
      role_id: ADMIN_ROLE_IDS,
      resource_id: GRANT_TO_ADMIN_ONLY,
    });

    const restored = [
      ...ADMIN_ROLE_IDS.map((role_id) => ({ role_id, resource_id: 10, created_at: now })),
      ...[...ADMIN_ROLE_IDS, ...SPECIALIST_ROLE_IDS].map((role_id) => ({
        role_id,
        resource_id: 26,
        created_at: now,
      })),
    ];
    await queryInterface.bulkInsert("roles_resources", restored);
  },
};

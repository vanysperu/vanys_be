"use strict";

// Corrige un efecto colateral de dos decisiones tomadas por separado:
// 1) 20260919120000/121000 revocaron "variable_general" completo para los
//    roles de empresa, cuando ese módulo solo tenía catálogos GLOBALES
//    (document_type, gender) — is_system exclusivo tenía sentido ahí.
// 2) Después, las etapas de producción (kanban de cotizaciones) se
//    modelaron como filas de general_variable en vez de un módulo propio
//    (pedido del usuario: "eso se crea en variables generales").
//
// Resultado: un Administrador de empresa se quedó SIN forma de configurar
// sus propias etapas de producción, porque la única pantalla que las
// gestiona (Variables Generales) le estaba bloqueada. El controller ya
// fuerza `company_id` del token en create/update/delete para no-is_system
// (ver variable_general.controller.ts), así que devolverle acceso es
// seguro: solo puede tocar SUS PROPIAS filas, nunca las de otra empresa ni
// las globales (company_id NULL solo las crea/edita is_system).
const ADMIN_ROLE_IDS = [2, 4, 5];

// Vista + CRUD completo (26=view, 27=create, 28=update, 29=delete,
// 30=list.endpoint, 31=detail.endpoint) — el rol "Especialista" (id 3) se
// queda sin esto a propósito, no le corresponde configurar catálogos.
const VARIABLE_GENERAL_RESOURCE_IDS = [26, 27, 28, 29, 30, 31];

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const grants = ADMIN_ROLE_IDS.flatMap((role_id) =>
      VARIABLE_GENERAL_RESOURCE_IDS.map((resource_id) => ({ role_id, resource_id, created_at: now })),
    );
    await queryInterface.bulkInsert("roles_resources", grants);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("roles_resources", {
      role_id: ADMIN_ROLE_IDS,
      resource_id: VARIABLE_GENERAL_RESOURCE_IDS,
    });
  },
};

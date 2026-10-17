"use strict";

// GET /business-unit/list ya está correctamente scopeado por company_id en
// el servicio (isSystem ? null : companyId), pero al estar registrado solo
// bajo el módulo "platform" (id 4), ningún rol de empresa normal podía
// llamarlo — ni siquiera para ver sus propias tiendas. Se le otorga el
// recurso puntual (id 36) al rol Administrador sin darle el resto del
// módulo platform (que sigue siendo is_system-only).
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      INSERT INTO roles_resources (role_id, resource_id, created_by, created_at)
      SELECT r.id, 36, NULL, NOW() FROM role r
      WHERE r.id IN (2, 4, 5)
      AND r.id NOT IN (SELECT role_id FROM roles_resources WHERE resource_id = 36)
    `);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("roles_resources", { resource_id: 36, role_id: [2, 4, 5] });
  },
};

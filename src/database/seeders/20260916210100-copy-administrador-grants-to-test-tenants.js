"use strict";

// El seeder de tenants de prueba (20260916200000) copió los accesos del rol
// 2 (Administrador NASA) a los roles 4 y 5 ANTES de que existiera este
// seeder de grants (20260916210000) — en ese momento el rol 2 no tenía nada
// que copiar. Este seeder repite la copia ahora que el rol 2 sí tiene
// accesos reales.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      INSERT INTO roles_resources (role_id, resource_id, created_by, created_at)
      SELECT 4, resource_id, NULL, NOW() FROM roles_resources
      WHERE role_id = 2 AND resource_id NOT IN (SELECT resource_id FROM roles_resources WHERE role_id = 4)
    `);
    await queryInterface.sequelize.query(`
      INSERT INTO roles_resources (role_id, resource_id, created_by, created_at)
      SELECT 5, resource_id, NULL, NOW() FROM roles_resources
      WHERE role_id = 2 AND resource_id NOT IN (SELECT resource_id FROM roles_resources WHERE role_id = 5)
    `);
  },

  async down(queryInterface) {
    // No-op: down de 20260916200000 ya limpia roles_resources de los roles 4/5.
  },
};

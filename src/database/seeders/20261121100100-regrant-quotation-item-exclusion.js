"use strict";

// «No aceptado» no se veía (pedido del usuario, 21-nov): el seeder del 17-nov
// dio `cotizacion.item.exclude.button` a los roles que ESE día tenían
// `cotizacion.update.button`. Un rol creado o ajustado después (puede editar
// cotizaciones pero no recibió el botón) no lo ve. Este seeder vuelve a dar
// el permiso a todo rol que hoy edita cotizaciones. Idempotente: no duplica.
const CODE = "cotizacion.item.exclude.button";
const LIKE_CODES = ["cotizacion.update.button"];

const findIdByCode = async (queryInterface, code) => {
  const [rows] = await queryInterface.sequelize.query("SELECT id FROM resources WHERE code = ?", { replacements: [code] });
  return rows[0]?.id ?? null;
};

module.exports = {
  async up(queryInterface) {
    const resourceId = await findIdByCode(queryInterface, CODE);
    if (!resourceId) return;

    await queryInterface.sequelize.query(
      `INSERT INTO roles_resources (role_id, resource_id, created_at)
       SELECT DISTINCT rr.role_id, :resourceId, NOW()
       FROM roles_resources rr
       INNER JOIN resources existing ON existing.id = rr.resource_id AND existing.code IN (:likeCodes)
       WHERE NOT EXISTS (SELECT 1 FROM roles_resources x WHERE x.role_id = rr.role_id AND x.resource_id = :resourceId)`,
      { replacements: { resourceId, likeCodes: LIKE_CODES } }
    );
  },

  // Sin vuelta atrás: no se puede distinguir qué filas agregó este seeder de
  // las que ya existían; quitar el botón se hace desde Roles.
  async down() {},
};

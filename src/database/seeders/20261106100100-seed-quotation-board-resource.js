"use strict";

// Recurso RBAC del tablero de cotizaciones (GET /quotation/board): trae cada
// columna del tablero con su total real, en UNA llamada. Antes la pantalla
// cargaba las 100 cotizaciones más nuevas de todos los estados y las repartía
// en columnas, así que una columna podía quedar incompleta.
//
// Lo recibe todo rol que ya lista cotizaciones (cotizacion.list.endpoint),
// Gestor incluido. Módulo, vista padre y roles se resuelven por CÓDIGO.
// Idempotente: correrlo dos veces no duplica nada.
const now = new Date();

const PREFERRED_ID = 227;
const MODULE_CODE = "cotizacion";
const PARENT_CODE = "cotizacion.list";
const CODE = "cotizacion.board.endpoint";
const GRANT_LIKE_CODE = "cotizacion.list.endpoint";

const findIdByCode = async (queryInterface, table, code) => {
  const [rows] = await queryInterface.sequelize.query(`SELECT id FROM ${table} WHERE code = ?`, {
    replacements: [code],
  });
  return rows[0]?.id ?? null;
};

module.exports = {
  async up(queryInterface) {
    const moduleId = await findIdByCode(queryInterface, "modules", MODULE_CODE);
    // Base que nunca sembró el módulo de cotizaciones: no hay dónde colgarlo.
    if (!moduleId) return;

    if (!(await findIdByCode(queryInterface, "resources", CODE))) {
      const parentId = await findIdByCode(queryInterface, "resources", PARENT_CODE);
      // Si en esa base el id preferido ya está tomado, la base asigna otro.
      const [taken] = await queryInterface.sequelize.query("SELECT 1 FROM resources WHERE id = ?", {
        replacements: [PREFERRED_ID],
      });
      const row = {
        module_id: moduleId,
        parent_id: parentId,
        type: "endpoint",
        code: CODE,
        name: "Tablero de cotizaciones (API)",
        description: null,
        route: "/quotation/board",
        verb: "GET",
        icon: null,
        show_in_menu: false,
        position: PREFERRED_ID,
        active: true,
        created_at: now,
      };
      await queryInterface.bulkInsert("resources", [taken.length > 0 ? row : { id: PREFERRED_ID, ...row }]);
    }

    const resourceId = await findIdByCode(queryInterface, "resources", CODE);
    await queryInterface.sequelize.query(
      `INSERT INTO roles_resources (role_id, resource_id, created_at)
       SELECT DISTINCT rr.role_id, :resourceId, NOW()
       FROM roles_resources rr
       INNER JOIN resources existing ON existing.id = rr.resource_id AND existing.code = :grantLikeCode
       WHERE NOT EXISTS (SELECT 1 FROM roles_resources x WHERE x.role_id = rr.role_id AND x.resource_id = :resourceId)`,
      { replacements: { resourceId, grantLikeCode: GRANT_LIKE_CODE } }
    );
  },

  async down(queryInterface) {
    const resourceId = await findIdByCode(queryInterface, "resources", CODE);
    if (!resourceId) return;
    await queryInterface.bulkDelete("roles_resources", { resource_id: resourceId });
    await queryInterface.bulkDelete("resources", { id: resourceId });
  },
};

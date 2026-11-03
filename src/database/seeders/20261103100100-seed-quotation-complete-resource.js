"use strict";

// Recurso RBAC de "Completar cotización" (PUT /quotation/:id/items): el
// equipo completa técnica, modo de precio y productos de una cotización que
// llegó desde la web ("Pendiente de cotizar"), antes de pasarla a Pendiente.
//
// Es parte del trabajo normal de cotizar, así que se otorga a todo rol que
// ya puede editar cotizaciones (cotizacion.update.button), Gestor incluido.
//
// Módulo, vista padre y roles se resuelven por CÓDIGO (nunca ids
// hardcodeados). Idempotente: correrlo dos veces no duplica nada.
const now = new Date();

const PREFERRED_ID = 220;
const MODULE_CODE = "cotizacion";
const PARENT_CODE = "cotizacion.list";
const CODE = "cotizacion.complete.button";
const GRANT_LIKE_CODE = "cotizacion.update.button";

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
        type: "button",
        code: CODE,
        name: "Completar cotización pedida desde la web",
        description: null,
        route: "/quotation/*/items",
        verb: "PUT",
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

"use strict";

// Recurso RBAC de PUT /quotation/item/:itemId/excluded (Sprint 2, 14-nov):
// marcar un producto de la cotización como "no aceptado" por el cliente, o
// reactivarlo. Lo recibe quien puede editar cotizaciones. Se resuelve por
// CÓDIGO (el id es solo preferido). Idempotente.
const now = new Date();

const PREFERRED_ID = 342;
const MODULE_CODE = "cotizacion";
const PARENT_CODE = "cotizacion.list";
const CODE = "cotizacion.item.exclude.button";
const LIKE_CODES = ["cotizacion.update.button"];

const findIdByCode = async (queryInterface, table, code) => {
  const [rows] = await queryInterface.sequelize.query(`SELECT id FROM ${table} WHERE code = ?`, { replacements: [code] });
  return rows[0]?.id ?? null;
};

module.exports = {
  async up(queryInterface) {
    const moduleId = await findIdByCode(queryInterface, "modules", MODULE_CODE);
    if (!moduleId) return;

    if (!(await findIdByCode(queryInterface, "resources", CODE))) {
      const [taken] = await queryInterface.sequelize.query("SELECT 1 FROM resources WHERE id = ?", { replacements: [PREFERRED_ID] });
      const row = {
        module_id: moduleId,
        parent_id: await findIdByCode(queryInterface, "resources", PARENT_CODE),
        type: "button",
        code: CODE,
        name: "Marcar producto como no aceptado",
        description: null,
        route: "/quotation/item/*/excluded",
        verb: "PUT",
        icon: null,
        show_in_menu: false,
        position: PREFERRED_ID,
        active: true,
        created_at: now,
      };
      await queryInterface.bulkInsert("resources", [taken.length > 0 ? row : { id: PREFERRED_ID, ...row }]);
    }

    await queryInterface.sequelize.query(
      `INSERT INTO roles_resources (role_id, resource_id, created_at)
       SELECT DISTINCT rr.role_id, :resourceId, NOW()
       FROM roles_resources rr
       INNER JOIN resources existing ON existing.id = rr.resource_id AND existing.code IN (:likeCodes)
       WHERE NOT EXISTS (SELECT 1 FROM roles_resources x WHERE x.role_id = rr.role_id AND x.resource_id = :resourceId)`,
      { replacements: { resourceId: await findIdByCode(queryInterface, "resources", CODE), likeCodes: LIKE_CODES } }
    );
  },

  async down(queryInterface) {
    const resourceId = await findIdByCode(queryInterface, "resources", CODE);
    if (!resourceId) return;
    await queryInterface.bulkDelete("roles_resources", { resource_id: resourceId });
    await queryInterface.bulkDelete("resources", { id: resourceId });
  },
};

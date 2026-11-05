"use strict";

// Recursos RBAC de:
// - "Ganancia" de una cotización (GET /quotation/:id/profit): información de
//   gestión (márgenes), así que la reciben los roles administradores (los que
//   pueden corregir pagos, payment.update.button), no un Gestor.
// - Resumen del mes de Caja (GET /cash-movement/month-summary): resultado del
//   mes, IGV estimado y neto; lo recibe quien ya puede listar Caja.
//
// Se resuelve todo por CÓDIGO (los ids son solo preferidos). Idempotente.
const now = new Date();

// [id preferido, módulo, vista padre, type, code, name, route, verb, otorgar como]
const resourceRows = [
  [244, "cotizacion", "cotizacion.list", "button", "cotizacion.profit.view.button", "Ver ganancia de la cotización",
    "/quotation/*/profit", "GET", ["payment.update.button"]],
  [245, "cash_movement", "cash_movement.list", "endpoint", "cash_movement.monthSummary.endpoint", "Resumen del mes de Caja (API)",
    "/cash-movement/month-summary", "GET", ["cash_movement.list.endpoint"]],
];

const codes = resourceRows.map((row) => row[4]);

const findIdByCode = async (queryInterface, table, code) => {
  const [rows] = await queryInterface.sequelize.query(`SELECT id FROM ${table} WHERE code = ?`, { replacements: [code] });
  return rows[0]?.id ?? null;
};

const idIsTaken = async (queryInterface, id) => {
  const [rows] = await queryInterface.sequelize.query("SELECT 1 FROM resources WHERE id = ?", { replacements: [id] });
  return rows.length > 0;
};

// Lo recibe cada rol que ya tiene alguno de `likeCodes` (sin duplicar).
const grantLike = (queryInterface, resourceId, likeCodes) =>
  queryInterface.sequelize.query(
    `INSERT INTO roles_resources (role_id, resource_id, created_at)
     SELECT DISTINCT rr.role_id, :resourceId, NOW()
     FROM roles_resources rr
     INNER JOIN resources existing ON existing.id = rr.resource_id AND existing.code IN (:likeCodes)
     WHERE NOT EXISTS (SELECT 1 FROM roles_resources x WHERE x.role_id = rr.role_id AND x.resource_id = :resourceId)`,
    { replacements: { resourceId, likeCodes } }
  );

module.exports = {
  async up(queryInterface) {
    for (const [preferredId, moduleCode, parentCode, type, code, name, route, verb, likeCodes] of resourceRows) {
      const moduleId = await findIdByCode(queryInterface, "modules", moduleCode);
      // Base sin ese módulo: no hay dónde colgar el recurso.
      if (!moduleId) continue;
      if (!(await findIdByCode(queryInterface, "resources", code))) {
        const row = {
          module_id: moduleId,
          parent_id: await findIdByCode(queryInterface, "resources", parentCode),
          type,
          code,
          name,
          description: null,
          route,
          verb,
          icon: null,
          show_in_menu: false,
          position: preferredId,
          active: true,
          created_at: now,
        };
        const taken = await idIsTaken(queryInterface, preferredId);
        await queryInterface.bulkInsert("resources", [taken ? row : { id: preferredId, ...row }]);
      }
      await grantLike(queryInterface, await findIdByCode(queryInterface, "resources", code), likeCodes);
    }
  },

  async down(queryInterface) {
    const [rows] = await queryInterface.sequelize.query("SELECT id FROM resources WHERE code IN (:codes)", { replacements: { codes } });
    const ids = rows.map((row) => row.id);
    if (ids.length === 0) return;
    await queryInterface.bulkDelete("roles_resources", { resource_id: ids });
    await queryInterface.bulkDelete("resources", { id: ids });
  },
};

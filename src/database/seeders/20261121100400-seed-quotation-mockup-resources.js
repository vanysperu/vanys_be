"use strict";

// Recursos RBAC de los mockups (diseños) de una cotización (pedido del usuario,
// 21-nov). Solo los ve el equipo:
// - ver la lista y el archivo: quien ve el detalle de la cotización
//   (cotizacion.find.endpoint);
// - subir y quitar: quien edita cotizaciones (cotizacion.update.button),
//   Gestor incluido, en su tienda (lo revisa el backend).
//
// Se resuelve todo por CÓDIGO (los ids son solo preferidos). Idempotente.
const now = new Date();

// [id preferido, módulo, vista padre, type, code, name, route, verb, otorgar como]
const resourceRows = [
  [345, "cotizacion", "cotizacion.list", "endpoint", "cotizacion.mockups.list.endpoint", "Ver diseños de la cotización (API)",
    "/quotation/*/mockups", "GET", ["cotizacion.find.endpoint"]],
  [346, "cotizacion", "cotizacion.list", "endpoint", "cotizacion.mockups.file.endpoint", "Ver el archivo de un diseño (API)",
    "/quotation/mockup/*/file", "GET", ["cotizacion.find.endpoint"]],
  [347, "cotizacion", "cotizacion.list", "button", "cotizacion.mockups.upload.button", "Subir diseños (mockups) a la cotización",
    "/quotation/*/mockups", "POST", ["cotizacion.update.button"]],
  [348, "cotizacion", "cotizacion.list", "button", "cotizacion.mockups.disable.button", "Quitar diseños (mockups) de la cotización",
    "/quotation/mockup/*/disable", "PATCH", ["cotizacion.update.button"]],
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

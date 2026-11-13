"use strict";

// Módulo "Flujo de producción" (Sprint 2, ítem 5). Tablas en
// 20261113120000-create-production-workflow.js.
//
// - La pantalla de configuración (ver y guardar columnas y reglas): los roles
//   que ya configuran los documentos de la empresa
//   (document_settings.update.button) — es configuración, nunca del Gestor
//   (CLAUDE.md sección 11.1).
// - Leer las columnas del kanban: cualquiera que pueda abrir una cotización
//   (cotizacion.find.endpoint), Gestor incluido. Cuelga de Cotizaciones.
//
// Módulos, vistas y roles se resuelven por CÓDIGO (los ids son solo
// preferidos). Idempotente: correrlo dos veces no duplica nada.
const now = new Date();

const MODULE_CODE = "production_workflow";
const PREFERRED_MODULE_ID = 23;
// En el menú, en Configuración después de "Documentos de la empresa".
const AFTER_MODULE_CODE = "document_settings";
const VIEW_CODE = "production_workflow.view";
const QUOTATION_MODULE_CODE = "cotizacion";
const QUOTATION_VIEW_CODE = "cotizacion.list";

const CONFIG_LIKE = ["document_settings.update.button"];
const BOARD_LIKE = ["cotizacion.find.endpoint"];

// [id preferido, módulo, padre, type, code, name, route, verb, show_in_menu, icon, otorgar como]
const resourceRows = [
  [270, MODULE_CODE, null, "view", VIEW_CODE, "Flujo de producción", "/configuracion/flujo-produccion", null, true, "kanban", CONFIG_LIKE],
  [271, MODULE_CODE, VIEW_CODE, "endpoint", "production_workflow.get.endpoint", "Ver el flujo de producción (API)",
    "/production-workflow/config", "GET", false, null, CONFIG_LIKE],
  [272, MODULE_CODE, VIEW_CODE, "button", "production_workflow.update.button", "Guardar el flujo de producción",
    "/production-workflow/config", "PUT", false, null, CONFIG_LIKE],
  [273, QUOTATION_MODULE_CODE, QUOTATION_VIEW_CODE, "endpoint", "production_workflow.board.endpoint",
    "Columnas del kanban de producción (API)", "/production-workflow/board", "GET", false, null, BOARD_LIKE],
];

const codes = resourceRows.map((row) => row[4]);

const findIdByCode = async (queryInterface, table, code) => {
  const [rows] = await queryInterface.sequelize.query(`SELECT id FROM ${table} WHERE code = ?`, { replacements: [code] });
  return rows[0]?.id ?? null;
};

const idIsTaken = async (queryInterface, table, id) => {
  const [rows] = await queryInterface.sequelize.query(`SELECT 1 FROM ${table} WHERE id = ?`, { replacements: [id] });
  return rows.length > 0;
};

const ensureModule = async (queryInterface) => {
  const existing = await findIdByCode(queryInterface, "modules", MODULE_CODE);
  if (existing) return existing;

  const [afterRows] = await queryInterface.sequelize.query("SELECT position FROM modules WHERE code = ?", {
    replacements: [AFTER_MODULE_CODE],
  });
  const position = afterRows[0] ? Number(afterRows[0].position) + 1 : 99;
  await queryInterface.sequelize.query("UPDATE modules SET position = position + 1 WHERE position >= ?", { replacements: [position] });

  const row = {
    code: MODULE_CODE,
    name: "Flujo de producción",
    description: "Columnas del kanban de producción de la empresa, su orden y cómo avanzan los productos",
    icon: "kanban",
    position,
    active: true,
    created_at: now,
  };
  const taken = await idIsTaken(queryInterface, "modules", PREFERRED_MODULE_ID);
  await queryInterface.bulkInsert("modules", [taken ? row : { id: PREFERRED_MODULE_ID, ...row }]);
  return findIdByCode(queryInterface, "modules", MODULE_CODE);
};

const insertResource = async (queryInterface, { preferredId, moduleId, parentId, type, code, name, route, verb, showInMenu, icon }) => {
  if (await findIdByCode(queryInterface, "resources", code)) return;
  const row = {
    module_id: moduleId,
    parent_id: parentId,
    type,
    code,
    name,
    description: null,
    route,
    verb,
    icon,
    show_in_menu: showInMenu,
    position: preferredId,
    active: true,
    created_at: now,
  };
  const taken = await idIsTaken(queryInterface, "resources", preferredId);
  await queryInterface.bulkInsert("resources", [taken ? row : { id: preferredId, ...row }]);
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
    const workflowModuleId = await ensureModule(queryInterface);
    const quotationModuleId = await findIdByCode(queryInterface, "modules", QUOTATION_MODULE_CODE);

    for (const [preferredId, moduleCode, parentCode, type, code, name, route, verb, showInMenu, icon, grantLikeCodes] of resourceRows) {
      const moduleId = moduleCode === MODULE_CODE ? workflowModuleId : quotationModuleId;
      if (!moduleId) continue;
      const parentId = parentCode ? await findIdByCode(queryInterface, "resources", parentCode) : null;
      await insertResource(queryInterface, { preferredId, moduleId, parentId, type, code, name, route, verb, showInMenu, icon });
      await grantLike(queryInterface, await findIdByCode(queryInterface, "resources", code), grantLikeCodes);
    }
  },

  async down(queryInterface) {
    const [rows] = await queryInterface.sequelize.query("SELECT id FROM resources WHERE code IN (:codes)", { replacements: { codes } });
    const ids = rows.map((row) => row.id);
    if (ids.length > 0) {
      await queryInterface.bulkDelete("roles_resources", { resource_id: ids });
      await queryInterface.bulkDelete("resources", { id: ids });
    }
    await queryInterface.bulkDelete("modules", { code: MODULE_CODE });
  },
};

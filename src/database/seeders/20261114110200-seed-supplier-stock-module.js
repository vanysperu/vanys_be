"use strict";

// Módulo "Stock de proveedores" (supplier_stock, Sprint 2 ítem 6). Tablas en
// 20261114110000-create-supplier-stock.js. Además del rol, la empresa tiene que
// tener la funcionalidad supplier_stock (company_feature, requireCompanyFeature).
//
// - Ver el stock (pantalla y consulta al cotizar): quien ya puede ver
//   cotizaciones (cotizacion.list / cotizacion.find.endpoint), Gestor incluido.
// - Fuentes (crear, editar, probar, actualizar, historial): los roles que
//   administran el catálogo (producto.create.button). Es configuración: nunca
//   el Gestor (CLAUDE.md §11.1).
//
// Módulos, vistas y roles se resuelven por CÓDIGO (los ids son solo
// preferidos). Idempotente.
const now = new Date();

const MODULE_CODE = "supplier_stock";
const PREFERRED_MODULE_ID = 25;
// En el menú, en Ventas después de Proveedores.
const AFTER_MODULE_CODE = "supplier";
const VIEW_CODE = "supplier_stock.view";
const PLATFORM_MODULE_CODE = "platform";

const VIEWER_LIKE = ["cotizacion.list"];
const QUOTER_LIKE = ["cotizacion.find.endpoint"];
const ADMIN_LIKE = ["producto.create.button"];

// [id preferido, módulo, padre, type, code, name, route, verb, show_in_menu, icon, otorgar como]
const resourceRows = [
  [281, MODULE_CODE, null, "view", VIEW_CODE, "Stock de proveedores", "/stock-proveedores", null, true, "stock", VIEWER_LIKE],
  [282, MODULE_CODE, VIEW_CODE, "endpoint", "supplier_stock.search.endpoint", "Buscar stock de proveedores (API)", "/supplier-stock/search", "GET", false, null, VIEWER_LIKE],
  [283, MODULE_CODE, VIEW_CODE, "endpoint", "supplier_stock.lookup.endpoint", "Stock de proveedores al cotizar (API)", "/supplier-stock/lookup", "GET", false, null, QUOTER_LIKE],
  [284, MODULE_CODE, VIEW_CODE, "endpoint", "supplier_stock.sources.endpoint", "Listar fuentes de stock (API)", "/supplier-stock/sources", "GET", false, null, ADMIN_LIKE],
  [285, MODULE_CODE, VIEW_CODE, "button", "supplier_stock.sources.create.button", "Crear fuente de stock", "/supplier-stock/sources", "POST", false, null, ADMIN_LIKE],
  [286, MODULE_CODE, VIEW_CODE, "button", "supplier_stock.sources.update.button", "Editar fuente de stock", "/supplier-stock/sources/*", "PUT", false, null, ADMIN_LIKE],
  [287, MODULE_CODE, VIEW_CODE, "button", "supplier_stock.sources.disable.button", "Deshabilitar fuente de stock", "/supplier-stock/sources/*/disable", "PUT", false, null, ADMIN_LIKE],
  [288, MODULE_CODE, VIEW_CODE, "endpoint", "supplier_stock.imports.endpoint", "Historial de lecturas de una fuente (API)", "/supplier-stock/sources/*/imports", "GET", false, null, ADMIN_LIKE],
  [289, MODULE_CODE, VIEW_CODE, "button", "supplier_stock.sources.refresh.button", "Actualizar stock ahora", "/supplier-stock/sources/*/refresh", "POST", false, null, ADMIN_LIKE],
  [290, MODULE_CODE, VIEW_CODE, "button", "supplier_stock.preview.button", "Probar fuente de stock", "/supplier-stock/preview", "POST", false, null, ADMIN_LIKE],
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
    name: "Stock de proveedores",
    description: "Stock de las importadoras leído de sus Excel, por proveedor y total",
    icon: "stock",
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
    const stockModuleId = await ensureModule(queryInterface);
    const platformModuleId = await findIdByCode(queryInterface, "modules", PLATFORM_MODULE_CODE);

    for (const [preferredId, moduleCode, parentCode, type, code, name, route, verb, showInMenu, icon, grantLikeCodes] of resourceRows) {
      const moduleId = moduleCode === MODULE_CODE ? stockModuleId : platformModuleId;
      if (!moduleId) continue;
      const parentId = parentCode ? await findIdByCode(queryInterface, "resources", parentCode) : null;
      await insertResource(queryInterface, { preferredId, moduleId, parentId, type, code, name, route, verb, showInMenu, icon });
      if (grantLikeCodes.length > 0) {
        await grantLike(queryInterface, await findIdByCode(queryInterface, "resources", code), grantLikeCodes);
      }
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

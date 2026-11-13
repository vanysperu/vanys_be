"use strict";

// Módulo "Proveedores" (supplier) y recursos de funcionalidades por empresa
// (company_feature). Tablas en 20261114100000-create-company-feature-and-supplier.js.
//
// - Proveedores (vista, listar, crear, editar, deshabilitar): los roles que ya
//   administran el catálogo de productos (producto.create.button). Es
//   configuración: nunca el Gestor (CLAUDE.md §11.1).
// - Funcionalidades de una empresa (ver y cambiar): SOLO Super Administrador.
//   Cuelgan de Empresas, no se otorgan a ningún rol y la ruta exige
//   requireSystemRole (mismo criterio que Google Drive).
//
// Módulos, vistas y roles se resuelven por CÓDIGO (los ids son solo
// preferidos). Idempotente.
const now = new Date();

const MODULE_CODE = "supplier";
const PREFERRED_MODULE_ID = 24;
// En el menú, en Ventas después de Productos.
const AFTER_MODULE_CODE = "producto";
const VIEW_CODE = "supplier.list";
const PLATFORM_MODULE_CODE = "platform";
const COMPANIES_VIEW_CODE = "platform.company.theme.view";

const CATALOG_LIKE = ["producto.create.button"];

// [id preferido, módulo, padre, type, code, name, route, verb, show_in_menu, icon, otorgar como]
const resourceRows = [
  [274, MODULE_CODE, null, "view", VIEW_CODE, "Proveedores", "/proveedores", null, true, "truck", CATALOG_LIKE],
  [275, MODULE_CODE, VIEW_CODE, "endpoint", "supplier.list.endpoint", "Listar proveedores (API)", "/supplier/list", "GET", false, null, CATALOG_LIKE],
  [276, MODULE_CODE, VIEW_CODE, "button", "supplier.create.button", "Crear proveedor", "/supplier/create", "POST", false, null, CATALOG_LIKE],
  [277, MODULE_CODE, VIEW_CODE, "button", "supplier.update.button", "Editar proveedor", "/supplier/update/*", "PUT", false, null, CATALOG_LIKE],
  [278, MODULE_CODE, VIEW_CODE, "button", "supplier.disable.button", "Deshabilitar proveedor", "/supplier/disable/*", "PUT", false, null, CATALOG_LIKE],
  [279, PLATFORM_MODULE_CODE, COMPANIES_VIEW_CODE, "endpoint", "company_feature.get.endpoint", "Ver funcionalidades de una empresa (API)",
    "/company-feature/*", "GET", false, null, []],
  [280, PLATFORM_MODULE_CODE, COMPANIES_VIEW_CODE, "button", "company_feature.update.button", "Prender o apagar funcionalidades de una empresa",
    "/company-feature/*", "PUT", false, null, []],
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
    name: "Proveedores",
    description: "Importadoras y proveedores de la empresa: sus códigos de producto y su stock",
    icon: "truck",
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
    const supplierModuleId = await ensureModule(queryInterface);
    const platformModuleId = await findIdByCode(queryInterface, "modules", PLATFORM_MODULE_CODE);

    for (const [preferredId, moduleCode, parentCode, type, code, name, route, verb, showInMenu, icon, grantLikeCodes] of resourceRows) {
      const moduleId = moduleCode === MODULE_CODE ? supplierModuleId : platformModuleId;
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

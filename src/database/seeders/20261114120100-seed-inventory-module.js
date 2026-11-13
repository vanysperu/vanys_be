"use strict";

// Módulo "Inventario" (inventory, Sprint 2 ítem 2). Tablas en
// 20261114120000-create-inventory.js. Además del rol, la empresa tiene que
// tener la funcionalidad "inventory" (company_feature).
//
// - Operar (ver stock, kardex y documentos; registrar ingresos, salidas,
//   ajustes y transferencias; despachar y recibir): quien ya ve cotizaciones
//   (cotizacion.list), Gestor incluido — su alcance queda en su tienda.
// - Configurar (almacenes, tiendas, "maneja stock"), anular documentos
//   confirmados y ver costos: los roles con producto.create.button
//   (Administrador). Es configuración: nunca el Gestor (CLAUDE.md §11.1).
//
// Módulos, vistas y roles se resuelven por CÓDIGO (los ids son solo
// preferidos). Idempotente.
const now = new Date();

const MODULE_CODE = "inventory";
const PREFERRED_MODULE_ID = 26;
// En el menú va en su propio grupo "Inventario" (frontend); la posición, después de Stock de proveedores.
const AFTER_MODULE_CODE = "supplier_stock";
const PLATFORM_MODULE_CODE = "platform";

const OPERATOR_LIKE = ["cotizacion.list"];
const ADMIN_LIKE = ["producto.create.button"];

// [id preferido, módulo, padre, type, code, name, route, verb, show_in_menu, icon, otorgar como]
const resourceRows = [
  [291, MODULE_CODE, null, "view", "inventory.stock.view", "Stock", "/inventario/stock", null, true, "boxes", OPERATOR_LIKE],
  [292, MODULE_CODE, null, "view", "inventory.documents.view", "Movimientos", "/inventario/documentos", null, true, "document", OPERATOR_LIKE],
  [293, MODULE_CODE, null, "view", "inventory.kardex.view", "Kardex", "/inventario/kardex", null, true, "chart", OPERATOR_LIKE],
  [294, MODULE_CODE, null, "view", "inventory.warehouses.view", "Almacenes", "/inventario/almacenes", null, true, "warehouse", ADMIN_LIKE],
  [295, MODULE_CODE, "inventory.stock.view", "endpoint", "inventory.stock.endpoint", "Stock por almacén (API)", "/inventory/stock", "GET", false, null, OPERATOR_LIKE],
  [296, MODULE_CODE, "inventory.stock.view", "endpoint", "inventory.stock.byProducts.endpoint", "Stock propio al cotizar (API)", "/inventory/stock/by-products", "GET", false, null, ["cotizacion.find.endpoint"]],
  [297, MODULE_CODE, "inventory.kardex.view", "endpoint", "inventory.kardex.endpoint", "Kardex (API)", "/inventory/kardex", "GET", false, null, OPERATOR_LIKE],
  [298, MODULE_CODE, "inventory.documents.view", "endpoint", "inventory.lots.endpoint", "Lotes sugeridos (API)", "/inventory/lots/suggest", "GET", false, null, OPERATOR_LIKE],
  [299, MODULE_CODE, "inventory.documents.view", "endpoint", "inventory.warehouses.list.endpoint", "Listar almacenes (API)", "/inventory/warehouses", "GET", false, null, OPERATOR_LIKE],
  [300, MODULE_CODE, "inventory.documents.view", "endpoint", "inventory.documents.list.endpoint", "Listar documentos (API)", "/inventory/documents", "GET", false, null, OPERATOR_LIKE],
  [301, MODULE_CODE, "inventory.documents.view", "endpoint", "inventory.documents.find.endpoint", "Ver un documento (API)", "/inventory/documents/*", "GET", false, null, OPERATOR_LIKE],
  [302, MODULE_CODE, "inventory.documents.view", "button", "inventory.documents.create.button", "Registrar documento", "/inventory/documents", "POST", false, null, OPERATOR_LIKE],
  [303, MODULE_CODE, "inventory.documents.view", "button", "inventory.documents.update.button", "Editar borrador", "/inventory/documents/*", "PUT", false, null, OPERATOR_LIKE],
  [304, MODULE_CODE, "inventory.documents.view", "button", "inventory.documents.post.button", "Confirmar documento", "/inventory/documents/*/post", "POST", false, null, OPERATOR_LIKE],
  [305, MODULE_CODE, "inventory.documents.view", "button", "inventory.transfers.dispatch.button", "Despachar transferencia", "/inventory/documents/*/dispatch", "POST", false, null, OPERATOR_LIKE],
  [306, MODULE_CODE, "inventory.documents.view", "button", "inventory.transfers.receive.button", "Recibir transferencia", "/inventory/documents/*/receive", "POST", false, null, OPERATOR_LIKE],
  [307, MODULE_CODE, "inventory.documents.view", "button", "inventory.documents.cancel.button", "Anular documento", "/inventory/documents/*/cancel", "POST", false, null, ADMIN_LIKE],
  [308, MODULE_CODE, "inventory.warehouses.view", "button", "inventory.warehouses.create.button", "Crear almacén", "/inventory/warehouses", "POST", false, null, ADMIN_LIKE],
  [309, MODULE_CODE, "inventory.warehouses.view", "button", "inventory.warehouses.update.button", "Configurar almacén", "/inventory/warehouses/*", "PUT", false, null, ADMIN_LIKE],
  [310, MODULE_CODE, "inventory.warehouses.view", "button", "inventory.warehouses.disable.button", "Deshabilitar almacén", "/inventory/warehouses/*/disable", "PUT", false, null, ADMIN_LIKE],
  [311, MODULE_CODE, "inventory.warehouses.view", "endpoint", "inventory.stores.endpoint", "Tiendas e inventario (API)", "/inventory/stores", "GET", false, null, ADMIN_LIKE],
  [312, MODULE_CODE, "inventory.warehouses.view", "button", "inventory.stores.update.button", "Configurar inventario de una tienda", "/inventory/stores/*", "PUT", false, null, ADMIN_LIKE],
  [313, MODULE_CODE, "inventory.warehouses.view", "button", "inventory.products.tracksStock.button", "Maneja stock en bloque", "/inventory/products/tracks-stock", "PUT", false, null, ADMIN_LIKE],
  [314, MODULE_CODE, "inventory.stock.view", "button", "inventory.costs.view.button", "Ver costos", "/inventory/costs", "GET", false, null, ["payment.update.button"]],
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
    name: "Inventario",
    description: "Almacenes, stock, ingresos, salidas, transferencias, lotes y kardex",
    icon: "warehouse",
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
    const inventoryModuleId = await ensureModule(queryInterface);
    const platformModuleId = await findIdByCode(queryInterface, "modules", PLATFORM_MODULE_CODE);

    for (const [preferredId, moduleCode, parentCode, type, code, name, route, verb, showInMenu, icon, grantLikeCodes] of resourceRows) {
      const moduleId = moduleCode === MODULE_CODE ? inventoryModuleId : platformModuleId;
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

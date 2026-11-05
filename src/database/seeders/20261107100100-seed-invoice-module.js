"use strict";

// Módulo "Facturas" (invoice) y recursos de Google Drive por empresa. Tablas en
// 20261107100000-create-invoices.js. Pedido explícito del usuario: tener
// mapeadas las facturas emitidas y las de compras, con la lista de las que
// faltan subir.
//
// - La pantalla Facturas y reintentar copias: roles administradores (los que
//   pueden corregir pagos, payment.update.button), como Cierres de caja.
// - Subir y ver el archivo de una factura: además, quien registra compras y
//   quien cambia el estado de una cotización (al comprar o cerrar se sube la
//   foto en el momento), Gestor incluido.
// - Conectar Google Drive y elegir dónde se guardan las facturas: SOLO Super
//   Administrador (pedido explícito del usuario). Esos recursos cuelgan de
//   Empresas, no se otorgan a ningún rol y la ruta exige requireSystemRole.
//
// Módulos, vistas y roles se resuelven por CÓDIGO (los ids son solo
// preferidos). Idempotente: correrlo dos veces no duplica nada.
const now = new Date();

const MODULE_CODE = "invoice";
const PREFERRED_MODULE_ID = 22;
// En el menú, en Finanzas después de Pagos.
const AFTER_MODULE_CODE = "payment";
const VIEW_CODE = "invoice.list";
const PLATFORM_MODULE_CODE = "platform";
const COMPANIES_VIEW_CODE = "platform.company.theme.view";

const ADMIN_LIKE = ["payment.update.button"];
const UPLOADER_LIKE = ["payment.update.button", "purchase_order.item.registerPurchase.button", "cotizacion.changeStatus.button"];

// [id preferido, módulo, padre, type, code, name, route, verb, show_in_menu, icon, otorgar como]
const resourceRows = [
  [236, MODULE_CODE, null, "view", VIEW_CODE, "Facturas", "/facturas", null, true, "document", ADMIN_LIKE],
  [237, MODULE_CODE, VIEW_CODE, "endpoint", "invoice.list.endpoint", "Listar facturas (API)", "/invoice/list", "GET", false, null, ADMIN_LIKE],
  [238, MODULE_CODE, VIEW_CODE, "button", "invoice.file.upload.button", "Subir archivo de factura", "/invoice/*/file", "POST", false, null, UPLOADER_LIKE],
  [239, MODULE_CODE, VIEW_CODE, "button", "invoice.file.view.button", "Ver archivo de factura", "/invoice/*/file", "GET", false, null, UPLOADER_LIKE],
  [240, MODULE_CODE, VIEW_CODE, "button", "invoice.drive.retry.button", "Reintentar copia a Google Drive", "/invoice/*/drive-retry", "PUT", false, null, ADMIN_LIKE],
  [241, PLATFORM_MODULE_CODE, COMPANIES_VIEW_CODE, "button", "google_drive.connect.button", "Conectar Google Drive de una empresa",
    "/google-drive/connect-url/*", "GET", false, null, []],
  [242, PLATFORM_MODULE_CODE, COMPANIES_VIEW_CODE, "endpoint", "google_drive.status.endpoint", "Estado del Google Drive de una empresa (API)",
    "/google-drive/status/*", "GET", false, null, []],
  [243, PLATFORM_MODULE_CODE, COMPANIES_VIEW_CODE, "button", "google_drive.disconnect.button", "Desconectar Google Drive de una empresa",
    "/google-drive/disconnect/*", "PUT", false, null, []],
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
    name: "Facturas",
    description: "Facturas emitidas y de compras, con su foto o PDF y la lista de las que faltan subir",
    icon: "document",
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
    const invoiceModuleId = await ensureModule(queryInterface);
    const platformModuleId = await findIdByCode(queryInterface, "modules", PLATFORM_MODULE_CODE);

    for (const [preferredId, moduleCode, parentCode, type, code, name, route, verb, showInMenu, icon, grantLikeCodes] of resourceRows) {
      const moduleId = moduleCode === MODULE_CODE ? invoiceModuleId : platformModuleId;
      // Base sin el módulo de plataforma: no hay dónde colgar lo de Drive.
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

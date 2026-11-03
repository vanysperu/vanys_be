"use strict";

// Módulo "API keys" (api_key) y sus recursos RBAC: pantalla para emitir,
// editar y revocar las keys de integración (ej. la web pública que envía
// pedidos de cotización, ver web_quote_request/README.md).
//
// Pedido explícito del usuario: "que solo pueda ver el super admin". Por eso
// NO se otorga a ningún rol: un rol is_system ya tiene todo implícitamente,
// y el módulo es system-only (core/rbac/systemOnlyModules.ts), así que
// tampoco se le puede otorgar a un rol de empresa desde Roles y accesos.
//
// Módulo y vista se resuelven por CÓDIGO (los ids son solo preferidos).
// Idempotente: correrlo dos veces no duplica nada.
const now = new Date();

const MODULE_CODE = "api_key";
const PREFERRED_MODULE_ID = 20;
// En el menú, justo después de Empresas/Tiendas (plataforma).
const AFTER_MODULE_CODE = "platform";
const VIEW_CODE = "api_key.list";

// [id preferido, padre (código o null), type, code, name, route, verb, show_in_menu, icon]
const resourceRows = [
  [221, null, "view", VIEW_CODE, "API keys", "/configuracion/api-keys", null, true, "key"],
  [222, VIEW_CODE, "endpoint", "api_key.list.endpoint", "Listar API keys (API)", "/api-key/list", "GET", false, null],
  [223, VIEW_CODE, "button", "api_key.create.button", "Crear API key", "/api-key/create", "POST", false, null],
  [224, VIEW_CODE, "button", "api_key.update.button", "Editar API key", "/api-key/update/*", "PUT", false, null],
  [225, VIEW_CODE, "button", "api_key.disable.button", "Revocar API key", "/api-key/disable/*", "PUT", false, null],
];

const codes = resourceRows.map((row) => row[3]);

const findIdByCode = async (queryInterface, table, code) => {
  const [rows] = await queryInterface.sequelize.query(`SELECT id FROM ${table} WHERE code = ?`, {
    replacements: [code],
  });
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
  await queryInterface.sequelize.query("UPDATE modules SET position = position + 1 WHERE position >= ?", {
    replacements: [position],
  });

  const row = {
    code: MODULE_CODE,
    name: "API keys",
    description: "Keys de integración (ej. la web pública) por empresa: emitir, editar y revocar",
    icon: "key",
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

module.exports = {
  async up(queryInterface) {
    const moduleId = await ensureModule(queryInterface);

    for (const [preferredId, parentCode, type, code, name, route, verb, showInMenu, icon] of resourceRows) {
      const parentId = parentCode ? await findIdByCode(queryInterface, "resources", parentCode) : null;
      await insertResource(queryInterface, { preferredId, moduleId, parentId, type, code, name, route, verb, showInMenu, icon });
    }
  },

  async down(queryInterface) {
    const [rows] = await queryInterface.sequelize.query("SELECT id FROM resources WHERE code IN (:codes)", {
      replacements: { codes },
    });
    const ids = rows.map((row) => row.id);
    if (ids.length > 0) {
      await queryInterface.bulkDelete("roles_resources", { resource_id: ids });
      await queryInterface.bulkDelete("resources", { id: ids });
    }
    await queryInterface.bulkDelete("modules", { code: MODULE_CODE });
  },
};

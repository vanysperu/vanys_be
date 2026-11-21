"use strict";

// Módulo "Préstamos" (loan, pedido del usuario 21-nov): préstamos de la
// empresa a personas, con interés simple y sus cobros, que mueven Caja.
// Tablas en 20261121100200-create-loan.js.
//
// Es dinero de la empresa (como las deudas con el personal): lo reciben los
// roles que ya ven "Deudas a personal" (employee_debt.list), los
// administradores. Nunca el Gestor (CLAUDE.md §11.1). El Super Administrador
// (is_system) ya tiene todo.
//
// Módulo, vista y roles se resuelven por CÓDIGO (los ids son solo
// preferidos). Idempotente.
const now = new Date();

const MODULE_CODE = "loan";
const PREFERRED_MODULE_ID = 28;
// En el menú (grupo Finanzas), después de Deudas a personal.
const AFTER_MODULE_CODE = "employee_debt";
const VIEW_CODE = "loan.list";

const FINANCE_ADMINS = ["employee_debt.list"];

// [id preferido, módulo, padre, type, code, name, route, verb, show_in_menu, icon, otorgar como]
const resourceRows = [
  [357, MODULE_CODE, null, "view", VIEW_CODE, "Préstamos", "/prestamos", null, true, "banknote", FINANCE_ADMINS],
  [358, MODULE_CODE, VIEW_CODE, "endpoint", "loan.list.endpoint", "Listar préstamos (API)", "/loan/list", "GET", false, null, FINANCE_ADMINS],
  [359, MODULE_CODE, VIEW_CODE, "endpoint", "loan.find.endpoint", "Ver un préstamo y sus cobros (API)", "/loan/find/*", "GET", false, null, FINANCE_ADMINS],
  [360, MODULE_CODE, VIEW_CODE, "button", "loan.create.button", "Registrar préstamo", "/loan/create", "POST", false, null, FINANCE_ADMINS],
  [361, MODULE_CODE, VIEW_CODE, "button", "loan.update.button", "Corregir préstamo", "/loan/update/*", "PUT", false, null, FINANCE_ADMINS],
  [362, MODULE_CODE, VIEW_CODE, "button", "loan.disable.button", "Anular o restaurar préstamo", "/loan/disable/*", "PUT", false, null, FINANCE_ADMINS],
  [363, MODULE_CODE, VIEW_CODE, "button", "loan.payment.create.button", "Registrar cobro de préstamo", "/loan/*/payment", "POST", false, null, FINANCE_ADMINS],
  [364, MODULE_CODE, VIEW_CODE, "button", "loan.payment.disable.button", "Anular cobro de préstamo", "/loan/payment/disable/*", "PUT", false, null, FINANCE_ADMINS],
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
    name: "Préstamos",
    description: "Préstamos de la empresa a personas: cuánto, a quién, interés y cobros",
    icon: "banknote",
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
    const moduleId = await ensureModule(queryInterface);
    if (!moduleId) return;

    for (const [preferredId, , parentCode, type, code, name, route, verb, showInMenu, icon, grantLikeCodes] of resourceRows) {
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

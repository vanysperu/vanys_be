"use strict";

// Módulo "Cierres de caja" (cash_closing) y sus recursos RBAC (plan
// cash-closing-plan.md §5; tablas en 20261102100000-create-cash-closing.js).
//
// Decisión del usuario (4): la pantalla de cierres y los saldos acumulados
// son SOLO de administradores. Todo se otorga a los roles que ya pueden
// corregir pagos (payment.update.button) y se excluye a cualquier rol
// "Gestor". La única excepción es /cash-closing/status (qué meses están
// cerrados, para el candado de Caja y los selectores de fecha): la recibe
// quien ya lista Caja, pagos o deudas o registra pagos/gastos, Gestor incluido.
//
// cash_closing.adjust.button no tiene endpoint: es la capacidad de corregir
// o anular filas de un mes cerrado (core/rbac/writeScope.ts →
// canAdjustClosedPeriods, ruta POST /cash-closing/adjust).
//
// Módulos, vistas padre y roles se resuelven por CÓDIGO (nunca ids
// hardcodeados; los ids son solo preferidos). Idempotente: correrlo dos veces
// no duplica nada.
const now = new Date();

const MODULE_CODE = "cash_closing";
const PREFERRED_MODULE_ID = 19;
// Va en el menú justo después de Caja.
const AFTER_MODULE_CODE = "cash_movement";
const VIEW_CODE = "cash_closing.list";
const GESTOR_ROLE_NAME = "gestor";

// [id preferido, padre (código o null), type, code, name, route, verb, show_in_menu, icon]
const resourceRows = [
  [208, null, "view", VIEW_CODE, "Cierres de caja", "/caja/cierres", null, true, "lock"],
  [209, VIEW_CODE, "endpoint", "cash_closing.status.endpoint", "Estado de los meses de caja (API)",
    "/cash-closing/status", "GET", false, null],
  [210, VIEW_CODE, "endpoint", "cash_closing.list.endpoint", "Listar cierres de caja (API)",
    "/cash-closing/list", "GET", false, null],
  [211, VIEW_CODE, "endpoint", "cash_closing.find.endpoint", "Detalle de un mes de caja (API)",
    "/cash-closing/find/*", "GET", false, null],
  [212, VIEW_CODE, "endpoint", "cash_closing.adjustments.endpoint", "Ajustes de un mes de caja (API)",
    "/cash-closing/*/adjustments", "GET", false, null],
  [213, VIEW_CODE, "endpoint", "cash_closing.events.endpoint", "Historial de un mes de caja (API)",
    "/cash-closing/*/events", "GET", false, null],
  [214, VIEW_CODE, "button", "cash_closing.balances.button", "Ver saldos de caja por cuenta",
    "/cash-closing/balances", "GET", false, null],
  [215, VIEW_CODE, "endpoint", "cash_closing.opening.endpoint", "Ver saldo inicial de la caja (API)",
    "/cash-closing/opening", "GET", false, null],
  [216, VIEW_CODE, "button", "cash_closing.opening.button", "Configurar saldo inicial de la caja",
    "/cash-closing/opening", "PUT", false, null],
  [217, VIEW_CODE, "button", "cash_closing.close.button", "Cerrar mes de caja",
    "/cash-closing/close/*", "PUT", false, null],
  [218, VIEW_CODE, "button", "cash_closing.reopen.button", "Reabrir mes de caja",
    "/cash-closing/reopen/*", "PUT", false, null],
  [219, VIEW_CODE, "button", "cash_closing.adjust.button", "Corregir o anular movimientos de un mes cerrado",
    "/cash-closing/adjust", "POST", false, null],
];

// [código nuevo, otorgar como (cada uno de estos códigos), ¿solo admin?]
const STATUS_GRANT_LIKE = [
  "cash_movement.list.endpoint",
  "payment.list.endpoint",
  "cotizacion.payment.create.button",
  "cotizacion.expense.create.button",
  "employee_debt.list.endpoint",
];
const ADMIN_GRANT_LIKE = ["payment.update.button"];

const grantsFor = (code) =>
  code === "cash_closing.status.endpoint"
    ? { likeCodes: STATUS_GRANT_LIKE, adminOnly: false }
    : { likeCodes: ADMIN_GRANT_LIKE, adminOnly: true };

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

// Crea el módulo (una sola vez) justo después de Caja en el menú: los
// módulos que venían después bajan un lugar.
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
    name: "Cierres de caja",
    description: "Cierre mensual de caja: saldo inicial, saldos por cuenta, cierres, reaperturas y ajustes",
    icon: "lock",
    position,
    active: true,
    created_at: now,
  };
  const taken = await idIsTaken(queryInterface, "modules", PREFERRED_MODULE_ID);
  await queryInterface.bulkInsert("modules", [taken ? row : { id: PREFERRED_MODULE_ID, ...row }]);
  return findIdByCode(queryInterface, "modules", MODULE_CODE);
};

// Si en esa base el id preferido ya está tomado, se deja que la base asigne
// otro: un id repetido haría fallar el arranque.
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

// Otorga el recurso nuevo a cada rol que ya tiene el permiso equivalente.
// `adminOnly`: nunca a un rol llamado "Gestor" (decisión del usuario).
const grantLike = (queryInterface, resourceId, existingCode, adminOnly) =>
  queryInterface.sequelize.query(
    `INSERT INTO roles_resources (role_id, resource_id, created_at)
     SELECT DISTINCT rr.role_id, :resourceId, NOW()
     FROM roles_resources rr
     INNER JOIN resources existing ON existing.id = rr.resource_id AND existing.code = :existingCode
     INNER JOIN role r ON r.id = rr.role_id
     WHERE NOT EXISTS (SELECT 1 FROM roles_resources x WHERE x.role_id = rr.role_id AND x.resource_id = :resourceId)
       AND (:adminOnly = 0 OR LOWER(TRIM(r.name)) <> :gestorName)`,
    { replacements: { resourceId, existingCode, adminOnly: adminOnly ? 1 : 0, gestorName: GESTOR_ROLE_NAME } }
  );

// Avisa (sin fallar) si un código "otorgar como" no existe en esa base: el
// recurso nuevo quedaría sin otorgar a nadie.
const warnMissingGrantCodes = async (queryInterface) => {
  for (const code of [...STATUS_GRANT_LIKE, ...ADMIN_GRANT_LIKE]) {
    if (await findIdByCode(queryInterface, "resources", code)) continue;
    console.warn(`[seeder cash_closing] No existe el recurso "${code}": no se otorgó nada como él`);
  }
};

module.exports = {
  async up(queryInterface) {
    const moduleId = await ensureModule(queryInterface);
    await warnMissingGrantCodes(queryInterface);

    // La vista va primera: los demás la usan como padre.
    for (const [preferredId, parentCode, type, code, name, route, verb, showInMenu, icon] of resourceRows) {
      const parentId = parentCode ? await findIdByCode(queryInterface, "resources", parentCode) : null;
      await insertResource(queryInterface, { preferredId, moduleId, parentId, type, code, name, route, verb, showInMenu, icon });

      const resourceId = await findIdByCode(queryInterface, "resources", code);
      const { likeCodes, adminOnly } = grantsFor(code);
      for (const likeCode of likeCodes) {
        await grantLike(queryInterface, resourceId, likeCode, adminOnly);
      }
    }
  },

  // Quita los recursos, sus permisos y el módulo (y devuelve el lugar en el menú).
  async down(queryInterface) {
    const [rows] = await queryInterface.sequelize.query("SELECT id FROM resources WHERE code IN (:codes)", {
      replacements: { codes },
    });
    const ids = rows.map((row) => row.id);
    if (ids.length > 0) {
      await queryInterface.bulkDelete("roles_resources", { resource_id: ids });
      await queryInterface.bulkDelete("resources", { id: ids });
    }

    const [moduleRows] = await queryInterface.sequelize.query("SELECT id, position FROM modules WHERE code = ?", {
      replacements: [MODULE_CODE],
    });
    const moduleRow = moduleRows[0];
    if (!moduleRow) return;
    await queryInterface.bulkDelete("modules", { id: [moduleRow.id] });
    await queryInterface.sequelize.query("UPDATE modules SET position = position - 1 WHERE position > ?", {
      replacements: [moduleRow.position],
    });
  },
};

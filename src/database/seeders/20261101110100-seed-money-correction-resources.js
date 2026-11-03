"use strict";

// Recursos RBAC de la corrección de dinero en todas las fuentes de Caja (ver
// la migración 20261101110000-money-correction-and-annulments.js).
//
// Decisión del usuario: corregir/anular lo hacen SOLO administradores. Cada
// recurso de escritura (y el "find" que usa el diálogo de corrección) se
// otorga a los roles que ya tienen el permiso de editar/anular pagos o
// deudas — Gestor no lo tiene — y además se excluye explícitamente a
// cualquier rol "Gestor". El historial (badge "Corregido (n)") sí lo ve quien
// ya lista esa fuente, Gestor incluido.
//
// Los historiales son tipo "button": /auth/my-access solo expone botones, y
// así el frontend sabe si el badge se puede abrir.
//
// Además renombra cash_movement.corrections.endpoint (sembrado como
// endpoint por 20261101100100 en la base de desarrollo) a
// cash_movement.corrections.button. En una base nueva, 20261101100100 ya lo
// crea con el código nuevo y este paso no hace nada: ambas terminan igual.
//
// Módulos, vistas padre y roles se resuelven por CÓDIGO (nunca ids
// hardcodeados). Idempotente: correrlo dos veces no duplica nada.
const now = new Date();

const OLD_CASH_HISTORY_CODE = "cash_movement.corrections.endpoint";
const CASH_HISTORY_CODE = "cash_movement.corrections.button";
const CASH_HISTORY_NAME = "Ver historial de correcciones de un movimiento";

// Rol operativo (CLAUDE.md 11.1): nunca recibe recursos de escritura de esta
// funcionalidad, aunque en alguna base se le haya otorgado a mano el
// permiso equivalente.
const GESTOR_ROLE_NAME = "gestor";

// [id preferido, módulo, vista padre, type, code, name, route, verb, otorgar como, ¿escritura/solo admin?]
const resourceRows = [
  [192, "payment", "payment.list", "endpoint", "payment.find.endpoint", "Buscar pago por ID (API)",
    "/payment/find/*", "GET", "payment.update.button", true],
  [193, "payment", "payment.list", "button", "payment.corrections.button", "Ver historial de correcciones de un pago",
    "/payment/*/corrections", "GET", "payment.list.endpoint", false],
  [194, "cotizacion", "cotizacion.list", "endpoint", "cotizacion.expense.find.endpoint", "Buscar gasto por ID (API)",
    "/quotation/expense/find/*", "GET", "payment.update.button", true],
  [195, "cotizacion", "cotizacion.list", "button", "cotizacion.expense.update.button", "Corregir gasto",
    "/quotation/expense/update/*", "PUT", "payment.update.button", true],
  [196, "cotizacion", "cotizacion.list", "button", "cotizacion.expense.disable.button", "Anular/restaurar gasto",
    "/quotation/expense/disable/*", "PUT", "payment.disable.button", true],
  [197, "cotizacion", "cotizacion.list", "button", "cotizacion.expense.corrections.button",
    "Ver historial de correcciones de un gasto", "/quotation/expense/*/corrections", "GET", "cotizacion.find.endpoint", false],
  [198, "purchase_order", "purchase_order.list", "endpoint", "purchase_order.purchase.find.endpoint",
    "Buscar compra por ID (API)", "/purchase-order/purchase/find/*", "GET", "payment.update.button", true],
  [199, "purchase_order", "purchase_order.list", "button", "purchase_order.purchase.update.button", "Corregir compra",
    "/purchase-order/purchase/update/*", "PUT", "payment.update.button", true],
  [200, "purchase_order", "purchase_order.list", "button", "purchase_order.purchase.disable.button", "Anular compra",
    "/purchase-order/purchase/disable/*", "PUT", "payment.disable.button", true],
  [201, "purchase_order", "purchase_order.list", "button", "purchase_order.purchase.corrections.button",
    "Ver historial de correcciones de una compra", "/purchase-order/purchase/*/corrections", "GET",
    "purchase_order.find.endpoint", false],
  [202, "employee_debt", "employee_debt.list", "endpoint", "employee_debt.find.endpoint", "Buscar deuda por ID (API)",
    "/employee-debt/find/*", "GET", "employee_debt.disable.button", true],
  [203, "employee_debt", "employee_debt.list", "button", "employee_debt.update.button", "Corregir deuda manual",
    "/employee-debt/update/*", "PUT", "employee_debt.disable.button", true],
  [204, "employee_debt", "employee_debt.list", "button", "employee_debt.corrections.button",
    "Ver historial de correcciones de una deuda", "/employee-debt/*/corrections", "GET", "employee_debt.list.endpoint", false],
  [205, "employee_debt", "employee_debt.list", "endpoint", "employee_debt.payment.find.endpoint",
    "Buscar reposición por ID (API)", "/employee-debt/payment/find/*", "GET", "employee_debt.payment.disable.button", true],
  [206, "employee_debt", "employee_debt.list", "button", "employee_debt.payment.update.button", "Corregir reposición",
    "/employee-debt/payment/update/*", "PUT", "employee_debt.payment.disable.button", true],
  [207, "employee_debt", "employee_debt.list", "button", "employee_debt.payment.corrections.button",
    "Ver historial de correcciones de una reposición", "/employee-debt/payment/*/corrections", "GET",
    "employee_debt.payments.endpoint", false],
];

const codes = resourceRows.map((row) => row[4]);

const findIdByCode = async (queryInterface, table, code) => {
  const [rows] = await queryInterface.sequelize.query(`SELECT id FROM ${table} WHERE code = ?`, {
    replacements: [code],
  });
  return rows[0]?.id ?? null;
};

// Si en esa base el id preferido ya está tomado, se deja que la base asigne
// otro: un id repetido haría fallar el arranque.
const insertResource = async (queryInterface, { preferredId, moduleId, parentId, type, code, name, route, verb }) => {
  if (await findIdByCode(queryInterface, "resources", code)) return;

  const [taken] = await queryInterface.sequelize.query("SELECT 1 FROM resources WHERE id = ?", {
    replacements: [preferredId],
  });
  const row = {
    module_id: moduleId,
    parent_id: parentId,
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
  await queryInterface.bulkInsert("resources", [taken.length > 0 ? row : { id: preferredId, ...row }]);
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

// cash_movement.corrections.endpoint → cash_movement.corrections.button.
// Conserva el id (y por lo tanto todos los permisos ya otorgados). Si en esa
// base ya existe el código nuevo, no se toca nada.
const renameCashHistoryResource = async (queryInterface) => {
  if (await findIdByCode(queryInterface, "resources", CASH_HISTORY_CODE)) return;
  await queryInterface.sequelize.query(
    "UPDATE resources SET code = :newCode, type = 'button', name = :name WHERE code = :oldCode",
    { replacements: { newCode: CASH_HISTORY_CODE, oldCode: OLD_CASH_HISTORY_CODE, name: CASH_HISTORY_NAME } }
  );
};

module.exports = {
  async up(queryInterface) {
    await renameCashHistoryResource(queryInterface);

    for (const [preferredId, moduleCode, parentCode, type, code, name, route, verb, grantLikeCode, adminOnly] of resourceRows) {
      const moduleId = await findIdByCode(queryInterface, "modules", moduleCode);
      // Base que nunca sembró ese módulo: no hay dónde colgar el recurso.
      if (!moduleId) continue;
      const parentId = await findIdByCode(queryInterface, "resources", parentCode);

      await insertResource(queryInterface, { preferredId, moduleId, parentId, type, code, name, route, verb });
      const resourceId = await findIdByCode(queryInterface, "resources", code);
      await grantLike(queryInterface, resourceId, grantLikeCode, adminOnly);
    }
  },

  // Quita los recursos nuevos y sus permisos. El renombre del historial de
  // Caja NO se revierte: en una base nueva ese recurso ya nace con el código
  // nuevo (20261101100100), y volver al viejo dejaría las dos bases distintas.
  async down(queryInterface) {
    const [rows] = await queryInterface.sequelize.query("SELECT id FROM resources WHERE code IN (:codes)", {
      replacements: { codes },
    });
    const ids = rows.map((row) => row.id);
    if (ids.length === 0) return;
    await queryInterface.bulkDelete("roles_resources", { resource_id: ids });
    await queryInterface.bulkDelete("resources", { id: ids });
  },
};

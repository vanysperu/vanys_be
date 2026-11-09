"use strict";

// Recursos RBAC de las transferencias entre cuentas (migración
// 20261110100000-create-cash-transfer.js). Son parte de Caja: cuelgan del
// módulo `cash_movement` y de su vista `cash_movement.list`, así que un rol
// que tiene Caja los recibe con ella (CLAUDE.md §2: el módulo trae sus
// endpoints, vistas y botones). Cada uno se otorga a los roles que ya tienen
// la acción equivalente sobre un movimiento manual:
//   - registrar  → quien registra movimientos  (cash_movement.create.button)
//   - corregir   → quien corrige movimientos   (cash_movement.update.button)
//   - anular     → quien anula movimientos     (cash_movement.disable.button)
//   - listar     → quien lista Caja            (cash_movement.list.endpoint)
// Se resuelve todo por CÓDIGO (los ids son solo preferidos). Idempotente.
const now = new Date();

const MODULE_CODE = "cash_movement";
const PARENT_VIEW_CODE = "cash_movement.list";

// [id preferido, type, code, name, route, verb, código del permiso equivalente]
const resourceRows = [
  [260, "button", "cash_movement.transfer.create.button", "Registrar transferencia entre cuentas",
    "/cash-movement/transfer/create", "POST", "cash_movement.create.button"],
  [261, "button", "cash_movement.transfer.update.button", "Corregir transferencia entre cuentas",
    "/cash-movement/transfer/update/*", "PUT", "cash_movement.update.button"],
  [262, "button", "cash_movement.transfer.disable.button", "Anular transferencia entre cuentas",
    "/cash-movement/transfer/disable/*", "PUT", "cash_movement.disable.button"],
  [263, "endpoint", "cash_movement.transfer.list.endpoint", "Listar transferencias entre cuentas (API)",
    "/cash-movement/transfer/list", "GET", "cash_movement.list.endpoint"],
];

const codes = resourceRows.map((row) => row[2]);

const findIdByCode = async (queryInterface, table, code) => {
  const [rows] = await queryInterface.sequelize.query(`SELECT id FROM ${table} WHERE code = ?`, { replacements: [code] });
  return rows[0]?.id ?? null;
};

// Si en esa base el id preferido ya está tomado, la base asigna otro: un id
// repetido haría fallar el arranque.
const insertResource = async (queryInterface, moduleId, parentId, [preferredId, type, code, name, route, verb]) => {
  if (await findIdByCode(queryInterface, "resources", code)) return;

  const [taken] = await queryInterface.sequelize.query("SELECT 1 FROM resources WHERE id = ?", { replacements: [preferredId] });
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

// Lo recibe cada rol que ya tiene el permiso equivalente (sin duplicar).
const grantLike = (queryInterface, resourceId, existingCode) =>
  queryInterface.sequelize.query(
    `INSERT INTO roles_resources (role_id, resource_id, created_at)
     SELECT DISTINCT rr.role_id, :resourceId, NOW()
     FROM roles_resources rr
     INNER JOIN resources existing ON existing.id = rr.resource_id AND existing.code = :existingCode
     WHERE NOT EXISTS (SELECT 1 FROM roles_resources x WHERE x.role_id = rr.role_id AND x.resource_id = :resourceId)`,
    { replacements: { resourceId, existingCode } }
  );

module.exports = {
  async up(queryInterface) {
    const moduleId = await findIdByCode(queryInterface, "modules", MODULE_CODE);
    // Sin el módulo de Caja (base que nunca lo sembró) no hay dónde colgarlos.
    if (!moduleId) return;
    const parentId = await findIdByCode(queryInterface, "resources", PARENT_VIEW_CODE);

    for (const row of resourceRows) {
      await insertResource(queryInterface, moduleId, parentId, row);
      await grantLike(queryInterface, await findIdByCode(queryInterface, "resources", row[2]), row[6]);
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

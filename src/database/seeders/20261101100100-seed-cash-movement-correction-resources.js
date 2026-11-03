"use strict";

// Recursos RBAC de la corrección de movimientos manuales de Caja (ver la
// migración 20261101110000-money-correction-and-annulments.js, que reemplazó
// a 20261101100000-create-cash-movement-correction.js):
//   - corregir un movimiento (PUT /cash-movement/update/:id): lo reciben los
//     roles que ya pueden anularlo ("cash_movement.disable.button") — es el
//     mismo público que ya maneja la plata de Caja;
//   - ver el historial de correcciones (GET /cash-movement/:id/corrections):
//     lo reciben los roles que ya listan Caja ("cash_movement.list.endpoint"),
//     igual que el historial de reposiciones en employee_debt — quien ve el
//     badge "Corregido" puede ver qué se corrigió y por qué.
// Los ids de rol se resuelven por código (nunca hardcodeados). Idempotente.
const now = new Date();

const MODULE_CODE = "cash_movement";
const PARENT_VIEW_CODE = "cash_movement.list";
const DISABLE_BUTTON_CODE = "cash_movement.disable.button";
const LIST_ENDPOINT_CODE = "cash_movement.list.endpoint";

// [id preferido, type, code, name, route, verb, código del permiso que ya otorga este]
const resourceRows = [
  [
    190,
    "button",
    "cash_movement.update.button",
    "Corregir movimiento",
    "/cash-movement/update/*",
    "PUT",
    DISABLE_BUTTON_CODE,
  ],
  [
    191,
    // Tipo button (no endpoint): /auth/my-access solo expone botones y el
    // frontend lo usa para saber si el badge "Corregido" se puede abrir. La
    // base de desarrollo que ya lo sembró como endpoint lo renombra
    // 20261101110100-seed-money-correction-resources.js (ambas terminan igual).
    "button",
    "cash_movement.corrections.button",
    "Ver historial de correcciones de un movimiento",
    "/cash-movement/*/corrections",
    "GET",
    LIST_ENDPOINT_CODE,
  ],
];

const codes = resourceRows.map((row) => row[2]);

const findIdByCode = async (queryInterface, table, code) => {
  const [rows] = await queryInterface.sequelize.query(`SELECT id FROM ${table} WHERE code = ?`, {
    replacements: [code],
  });
  return rows[0]?.id ?? null;
};

// Si en esa base el id preferido ya está tomado, se deja que la base asigne
// otro: un id repetido haría fallar el arranque.
const insertResource = async (queryInterface, moduleId, parentId, [preferredId, type, code, name, route, verb]) => {
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
    // Sin el módulo de Caja (base que nunca lo sembró) no hay nada que colgar.
    if (!moduleId) return;
    const parentId = await findIdByCode(queryInterface, "resources", PARENT_VIEW_CODE);

    for (const row of resourceRows) {
      await insertResource(queryInterface, moduleId, parentId, row);
      const resourceId = await findIdByCode(queryInterface, "resources", row[2]);
      await grantLike(queryInterface, resourceId, row[6]);
    }
  },

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

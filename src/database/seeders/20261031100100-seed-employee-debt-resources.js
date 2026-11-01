"use strict";

// Recursos RBAC de reposiciones y deudas manuales a trabajadores (ver la
// migración 20261031100000-cash-integrity-and-reimbursements.js):
//   - ver el detalle de deudas y el historial de reposiciones: lo reciben
//     los roles que ya listan "Deudas a personal";
//   - registrar/anular una deuda manual y anular una reposición: lo reciben
//     los roles que ya pueden reponer ("Marcar como pagado") — es el mismo
//     público que maneja la plata del personal.
const now = new Date();

const EMPLOYEE_DEBT_MODULE_ID = 14;
const EMPLOYEE_DEBT_VIEW_ID = 155;
const PAY_BUTTON_CODE = "employee_debt.pay.button";
const LIST_ENDPOINT_CODE = "employee_debt.list.endpoint";

// [id preferido, type, code, name, route, verb, código del permiso que ya otorga este]
const resourceRows = [
  [
    171,
    "endpoint",
    "employee_debt.payments.endpoint",
    "Historial de reposiciones (API)",
    "/employee-debt/payments",
    "GET",
    LIST_ENDPOINT_CODE,
  ],
  [
    172,
    "button",
    "employee_debt.payment.disable.button",
    "Anular reposición",
    "/employee-debt/payment/disable/*",
    "PUT",
    PAY_BUTTON_CODE,
  ],
  [
    173,
    "endpoint",
    "employee_debt.detail.endpoint",
    "Detalle de deudas de un trabajador (API)",
    "/employee-debt/detail",
    "GET",
    LIST_ENDPOINT_CODE,
  ],
  [
    174,
    "button",
    "employee_debt.create.button",
    "Registrar deuda manual",
    "/employee-debt/create",
    "POST",
    PAY_BUTTON_CODE,
  ],
  [
    175,
    "button",
    "employee_debt.disable.button",
    "Anular deuda manual",
    "/employee-debt/disable/*",
    "PUT",
    PAY_BUTTON_CODE,
  ],
];

const codes = resourceRows.map((row) => row[2]);

const findResourceId = async (queryInterface, code) => {
  const [rows] = await queryInterface.sequelize.query("SELECT id FROM resources WHERE code = ?", { replacements: [code] });
  return rows[0]?.id ?? null;
};

// Si en esa base alguien ya creó a mano un recurso con el id preferido, se
// deja que la base asigne otro: un id repetido haría fallar el arranque.
const insertResource = async (queryInterface, [preferredId, type, code, name, route, verb]) => {
  if (await findResourceId(queryInterface, code)) return;

  const [taken] = await queryInterface.sequelize.query("SELECT 1 FROM resources WHERE id = ?", {
    replacements: [preferredId],
  });
  const row = {
    module_id: EMPLOYEE_DEBT_MODULE_ID,
    parent_id: EMPLOYEE_DEBT_VIEW_ID,
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
     SELECT rr.role_id, :resourceId, NOW()
     FROM roles_resources rr
     INNER JOIN resources existing ON existing.id = rr.resource_id AND existing.code = :existingCode
     WHERE NOT EXISTS (SELECT 1 FROM roles_resources x WHERE x.role_id = rr.role_id AND x.resource_id = :resourceId)`,
    { replacements: { resourceId, existingCode } }
  );

module.exports = {
  async up(queryInterface) {
    for (const row of resourceRows) {
      await insertResource(queryInterface, row);
      const resourceId = await findResourceId(queryInterface, row[2]);
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

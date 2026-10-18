"use strict";

// Dos módulos nuevos pedidos explícitamente por el usuario:
//
//   - "Por cobrar" (receivable): "quiero poder ver los pagos que me falta
//     cobrar de cotizaciones". Se otorga a los roles que ya ven "Pagos
//     recibidos" (mismo público: quien sigue la plata de los clientes).
//   - "Recordatorios" (reminder): "crear notificaciones que salgan en el
//     tiempo que yo le coloque para que me recuerde cosas a mí o a otro
//     usuario". Se otorga a TODOS los roles de empresa: cualquiera puede
//     recibir un recordatorio, y para verlo necesita el módulo. Los roles que
//     se creen después lo reciben al crearse (ver role/services/create).
//
// "Por cobrar" se ubica justo después de "Pagos recibidos" (posición 14), así
// que "Deudas a personal" baja un lugar.
const now = new Date();

const RECEIVABLE_MODULE_ID = 16;
const REMINDER_MODULE_ID = 17;
const PAYMENT_LIST_VIEW_ID = 151;
const EMPLOYEE_DEBT_MODULE_ID = 14;

const modules = [
  {
    id: RECEIVABLE_MODULE_ID,
    code: "receivable",
    name: "Por cobrar",
    description: "Saldos pendientes de cobro de las cotizaciones aceptadas",
    icon: "receipt",
    position: 14,
    active: true,
    created_at: now,
  },
  {
    id: REMINDER_MODULE_ID,
    code: "reminder",
    name: "Recordatorios",
    description: "Recordatorios programados para uno mismo o para otro usuario",
    icon: "bell",
    position: 16,
    active: true,
    created_at: now,
  },
];

// [id, module_id, parent_id, type, code, name, route, verb, show_in_menu, icon]
const resourceRows = [
  [159, RECEIVABLE_MODULE_ID, null, "view", "receivable.list", "Por cobrar", "/por-cobrar", null, true, "receipt"],
  [160, RECEIVABLE_MODULE_ID, 159, "endpoint", "receivable.list.endpoint", "Listar saldos por cobrar (API)", "/receivable/list", "GET", false],

  [161, REMINDER_MODULE_ID, null, "view", "reminder.list", "Recordatorios", "/recordatorios", null, true, "bell"],
  [162, REMINDER_MODULE_ID, 161, "button", "reminder.create.button", "Crear recordatorio", "/reminder/create", "POST", false],
  [163, REMINDER_MODULE_ID, 161, "button", "reminder.update.button", "Editar recordatorio", "/reminder/update/*", "PUT", false],
  [164, REMINDER_MODULE_ID, 161, "button", "reminder.disable.button", "Cancelar/reactivar recordatorio", "/reminder/disable/*", "PUT", false],
  [165, REMINDER_MODULE_ID, 161, "endpoint", "reminder.list.endpoint", "Listar recordatorios (API)", "/reminder/list", "GET", false],
  [166, REMINDER_MODULE_ID, 161, "endpoint", "reminder.due.endpoint", "Recordatorios vencidos sin leer (API)", "/reminder/due", "GET", false],
  [167, REMINDER_MODULE_ID, 161, "endpoint", "reminder.read.endpoint", "Marcar recordatorio como visto (API)", "/reminder/read/*", "PUT", false],
  [168, REMINDER_MODULE_ID, 161, "endpoint", "reminder.recipients.endpoint", "Usuarios a los que se puede avisar (API)", "/reminder/recipients", "GET", false],
];

const resources = resourceRows.map(([id, module_id, parent_id, type, code, name, route, verb, show_in_menu, icon]) => ({
  id,
  module_id,
  parent_id,
  type,
  code,
  name,
  description: null,
  route,
  verb,
  icon: icon ?? null,
  show_in_menu,
  position: id,
  active: true,
  created_at: now,
}));

const idsOf = (moduleId) => resourceRows.filter((row) => row[1] === moduleId).map((row) => row[0]);

// Inserta las filas de roles_resources que falten (idempotente por rol).
const grant = (queryInterface, resourceIds, roleCondition, replacements = {}) =>
  queryInterface.sequelize.query(
    `INSERT INTO roles_resources (role_id, resource_id, created_at)
     SELECT r.id, res.id, NOW()
     FROM role r
     INNER JOIN resources res ON res.id IN (:resourceIds)
     WHERE ${roleCondition}
       AND NOT EXISTS (SELECT 1 FROM roles_resources rr WHERE rr.role_id = r.id AND rr.resource_id = res.id)`,
    { replacements: { ...replacements, resourceIds } }
  );

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkUpdate("modules", { position: 15 }, { id: EMPLOYEE_DEBT_MODULE_ID });
    await queryInterface.bulkInsert("modules", modules);
    await queryInterface.bulkInsert("resources", resources);

    // `roleCondition` es texto fijo de este archivo, nunca un valor externo.
    await grant(
      queryInterface,
      idsOf(RECEIVABLE_MODULE_ID),
      "r.is_system = false AND EXISTS (SELECT 1 FROM roles_resources p WHERE p.role_id = r.id AND p.resource_id = :paymentViewId)",
      { paymentViewId: PAYMENT_LIST_VIEW_ID }
    );
    await grant(queryInterface, idsOf(REMINDER_MODULE_ID), "r.is_system = false");
  },

  async down(queryInterface) {
    const resourceIds = resourceRows.map((row) => row[0]);
    await queryInterface.bulkDelete("roles_resources", { resource_id: resourceIds });
    await queryInterface.bulkDelete("resources", { id: resourceIds });
    await queryInterface.bulkDelete("modules", { id: [RECEIVABLE_MODULE_ID, REMINDER_MODULE_ID] });
    await queryInterface.bulkUpdate("modules", { position: 14 }, { id: EMPLOYEE_DEBT_MODULE_ID });
  },
};

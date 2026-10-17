"use strict";

// Bug encontrado al revisar visualmente el módulo de pagos nuevo: un Gestor
// puede REGISTRAR un pago (cotizacion.payment.create.button) y un
// movimiento de caja (cash_movement.create.button), pero ninguno de esos
// formularios podía listar el catálogo de general_variable (método de
// pago, categoría de caja) porque "variable_general.list.endpoint" nunca
// se le otorgó — el select quedaba vacío y la validación ("El método de
// pago es obligatorio") bloqueaba el guardado. No es un problema nuevo de
// este módulo: ya afectaba igual al formulario de Caja.
//
// Se otorga SOLO el endpoint de lectura (id 30) — nunca "variable_general.
// list" (id 26, la vista/ítem de menú "Variables Generales") ni create/
// update/disable: el Gestor sigue sin poder gestionar el catálogo en sí,
// solo puede leerlo para llenar sus propios formularios operativos.
const now = new Date();

const GESTOR_ROLE_ID = 6;
const RESOURCE_ID = 30; // variable_general.list.endpoint (GET /variable_general/list)

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert("roles_resources", [{ role_id: GESTOR_ROLE_ID, resource_id: RESOURCE_ID, created_at: now }]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("roles_resources", { role_id: GESTOR_ROLE_ID, resource_id: RESOURCE_ID });
  },
};

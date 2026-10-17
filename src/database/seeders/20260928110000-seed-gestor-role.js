"use strict";

// Nuevo rol base "Gestor" (pedido explícito del usuario: "al admin no le
// sale roles para crear usuario, debería salirle gestor aunque sea para
// crear las cotizaciones y eso") — es el rol "usuario operativo" descrito
// en CLAUDE.md sección 11.1: crea/gestiona cotizaciones, clientes y
// compras, pero NUNCA configuración (usuarios, roles, variables generales,
// tiendas/empresas). A propósito NO se le otorga
// "roles_access.viewAllBusinessUnits.button" — por defecto queda limitado
// a su propia tienda (regla de oro de negocios ya implementada en
// core/rbac/businessUnitScope.ts), un admin se lo puede dar después desde
// "Gestionar accesos" si de verdad necesita ver todas las tiendas.
//
// Rol global/plantilla (company_id NULL, is_system false) — mismo criterio
// que "Administrador"/"Especialista": toda empresa lo ve disponible sin que
// cada una tenga que crearlo de cero.
const now = new Date();

const GESTOR_ROLE_ID = 6;

// Códigos ya sembrados en migraciones anteriores (cliente, producto,
// cotizacion, purchase_order, cash_movement, users básicos de cuenta) —
// no se crean resources nuevos, solo se referencian los ids existentes.
const RESOURCE_CODES = [
  "users.account.endpoint",
  "users.changePassword.endpoint",
  "cliente.list",
  "cliente.list.endpoint",
  "cliente.create.button",
  "cliente.update.button",
  "producto.list",
  "producto.list.endpoint",
  "producto.technique.list",
  "producto.technique.list.endpoint",
  "cotizacion.list",
  "cotizacion.create.button",
  "cotizacion.update.button",
  "cotizacion.changeStatus.button",
  "cotizacion.list.endpoint",
  "cotizacion.find.endpoint",
  "cotizacion.item.changeStage.button",
  "cotizacion.payment.create.button",
  "cotizacion.expense.create.button",
  "cotizacion.pdf.endpoint",
  "purchase_order.list",
  "purchase_order.create.button",
  "purchase_order.item.updateStatus.button",
  "purchase_order.list.endpoint",
  "purchase_order.find.endpoint",
  "purchase_order.item.registerPurchase.button",
  "cash_movement.list",
  "cash_movement.create.button",
  "cash_movement.list.endpoint",
];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert("role", [
      {
        id: GESTOR_ROLE_ID,
        name: "Gestor",
        description: "Usuario operativo: crea y gestiona cotizaciones, clientes y compras de su propia tienda",
        status: true,
        is_system: false,
        company_id: null,
        created_at: now,
      },
    ]);

    const [resourceRows] = await queryInterface.sequelize.query(
      `SELECT id FROM resources WHERE code IN (${RESOURCE_CODES.map((code) => queryInterface.sequelize.escape(code)).join(",")})`
    );
    const resourceIds = resourceRows.map((row) => row.id);

    await queryInterface.bulkInsert(
      "roles_resources",
      resourceIds.map((resource_id) => ({ role_id: GESTOR_ROLE_ID, resource_id, created_at: now }))
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("roles_resources", { role_id: GESTOR_ROLE_ID });
    await queryInterface.bulkDelete("role", { id: GESTOR_ROLE_ID });
  },
};

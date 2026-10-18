"use strict";

const { columnExists } = require("../migration-helpers");

// Cuenta de la empresa por la que entró o salió el dinero (pedido explícito
// del usuario: "no especifica a qué banco fue realizado" / "cuando se hace un
// egreso y un ingreso también debemos especificar de qué banco").
//
// Las cuentas ya existen: son filas de general_variable con
// category="payment_account" (banco, Yape, Plin), las que la empresa carga
// en "Documentos de la empresa". NULL = efectivo (sin cuenta).
//
// - quotation_payment: a qué cuenta entró el pago del cliente.
// - cash_movement: desde/hacia qué cuenta fue el ingreso o egreso manual.
// - employee_debt: desde qué cuenta se le repuso el dinero al trabajador.
//
// ON DELETE SET NULL: si alguien borra la cuenta, el movimiento queda como
// "sin cuenta" en vez de bloquear el borrado o perder el movimiento.
const TABLES = ["quotation_payment", "cash_movement", "employee_debt"];

module.exports = {
  async up(queryInterface, Sequelize) {
    for (const table of TABLES) {
      if (await columnExists(queryInterface, table, "payment_account_id")) continue;

      await queryInterface.addColumn(table, "payment_account_id", { type: Sequelize.BIGINT, allowNull: true });
      await queryInterface.addConstraint(table, {
        fields: ["payment_account_id"],
        type: "foreign key",
        name: `fk_${table}_payment_account_id`,
        references: { table: "general_variable", field: "id" },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      });
    }
  },

  async down(queryInterface) {
    for (const table of TABLES) {
      if (!(await columnExists(queryInterface, table, "payment_account_id"))) continue;
      await queryInterface.removeConstraint(table, `fk_${table}_payment_account_id`);
      await queryInterface.removeColumn(table, "payment_account_id");
    }
  },
};

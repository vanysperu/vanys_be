"use strict";

const { columnExists } = require("../migration-helpers");

// Pagos parciales de deudas a personal (pedido explícito de QA: "ingresar un
// monto personalizado y descontarlo del saldo pendiente"). Antes
// `markEmployeeDebtAsPaid` solo podía liquidar TODA la deuda pendiente de un
// trabajador de una sola vez porque cada fila era binaria (pending/paid).
//
// `paid_amount` guarda cuánto se le repuso YA de esa fila puntual
// (0 <= paid_amount <= amount). Una fila sigue en status="pending" mientras
// paid_amount < amount (aunque tenga un abono parcial); pasa a "paid" recién
// cuando paid_amount alcanza a amount. El monto realmente pendiente de una
// fila es siempre `amount - paid_amount`.
module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await columnExists(queryInterface, "employee_debt", "paid_amount"))) {
      await queryInterface.addColumn("employee_debt", "paid_amount", {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      });
    }

    // Las filas ya marcadas "paid" antes de este cambio se consideran
    // liquidadas por su monto completo. Corre aunque la columna ya existiera:
    // si un arranque anterior se cortó entre el ALTER y este UPDATE (la base
    // se actualiza sola al arrancar, ver src/database/autoMigrate.ts), el
    // reintento completa el relleno. Una fila "paid" siempre tiene
    // paid_amount = amount, así que repetirlo no cambia nada más.
    await queryInterface.sequelize.query(
      "UPDATE employee_debt SET paid_amount = amount WHERE status = 'paid' AND paid_amount <> amount"
    );
  },

  async down(queryInterface) {
    if (!(await columnExists(queryInterface, "employee_debt", "paid_amount"))) return;
    await queryInterface.removeColumn("employee_debt", "paid_amount");
  },
};

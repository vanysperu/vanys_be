"use strict";

const { columnExists } = require("../migration-helpers");

const COLUMN = "operation_number";
// Las filas de dinero que sale de la empresa. Una compra se guarda como su gasto,
// y lo que un trabajador pagó con su plata sale de la empresa al reponérselo.
const TABLES = ["quotation_expense", "cash_movement", "employee_debt_payment"];

// Pedido explícito del usuario: "los gastos y pagos efectuados con dinero de la
// empresa deben tener la opción de colocar su número de operación". Mismo tipo que
// quotation_payment.operation_number. Opcional: lo ya registrado queda sin número.
module.exports = {
  async up(queryInterface, Sequelize) {
    for (const table of TABLES) {
      if (await columnExists(queryInterface, table, COLUMN)) continue;
      await queryInterface.addColumn(table, COLUMN, { type: Sequelize.STRING(50), allowNull: true });
    }
  },

  async down(queryInterface) {
    for (const table of TABLES) {
      if (!(await columnExists(queryInterface, table, COLUMN))) continue;
      await queryInterface.removeColumn(table, COLUMN);
    }
  },
};

"use strict";

const { columnExists } = require("../migration-helpers");

const COLUMN = "show_in_quotation";

// Pedido explícito del usuario: "decidir cuáles van a salir en la cotización y
// cuáles no, ya que hay cuentas internas y externas". Solo lo usan las cuentas
// de pago (category = "payment_account"). Nace en true para que los PDF de hoy
// sigan igual: cada empresa marca sus cuentas internas.
module.exports = {
  async up(queryInterface, Sequelize) {
    if (await columnExists(queryInterface, "general_variable", COLUMN)) return;
    await queryInterface.addColumn("general_variable", COLUMN, {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
  },

  async down(queryInterface) {
    if (!(await columnExists(queryInterface, "general_variable", COLUMN))) return;
    await queryInterface.removeColumn("general_variable", COLUMN);
  },
};

"use strict";

const { columnExists } = require("../migration-helpers");

// CCI de las cuentas bancarias (pedido del usuario, 21-nov): en Perú cada
// cuenta tiene dos números, el propio del banco y el código interbancario
// (CCI, 20 dígitos). Las cuentas de pago son filas de general_variable
// (category = 'payment_account'): ref1 = número de cuenta o celular, ref2 =
// QR, y ahora ref3 = CCI (solo en cuentas bancarias). Columna genérica, como
// ref1/ref2, porque la tabla guarda varios catálogos.
module.exports = {
  async up(queryInterface) {
    if (await columnExists(queryInterface, "general_variable", "ref3")) return;
    await queryInterface.sequelize.query("ALTER TABLE general_variable ADD COLUMN ref3 VARCHAR(255) NULL AFTER ref2");
  },

  async down(queryInterface) {
    if (!(await columnExists(queryInterface, "general_variable", "ref3"))) return;
    await queryInterface.sequelize.query("ALTER TABLE general_variable DROP COLUMN ref3");
  },
};

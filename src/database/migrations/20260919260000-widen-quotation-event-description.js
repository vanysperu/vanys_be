"use strict";

// El timeline arma su descripción combinando texto de otras fuentes (ej.
// "Gasto registrado: <descripción del gasto> por S/ X" — y esa descripción
// puede incluir hasta 500 caracteres de notas de una compra) — igual
// problema que ya se corrigió en quotation_expense.description: 255
// caracteres no alcanzan y producían un error crudo de MySQL.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("quotation_event", "description", {
      type: Sequelize.TEXT,
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("quotation_event", "description", {
      type: Sequelize.STRING(255),
      allowNull: false,
    });
  },
};

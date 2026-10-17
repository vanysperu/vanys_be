"use strict";

// La descripción de un gasto generado por una compra parcial
// ("Compra: <producto> x<cantidad> — <notas>") puede superar los 255
// caracteres que permitía la columna sin siquiera acercarse al límite de
// 500 caracteres que el frontend ya permite en el campo de notas — eso
// producía un error crudo de MySQL ("Data too long...") en vez de un
// mensaje entendible. TEXT no tiene ese límite práctico.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("quotation_expense", "description", {
      type: Sequelize.TEXT,
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("quotation_expense", "description", {
      type: Sequelize.STRING(255),
      allowNull: false,
    });
  },
};

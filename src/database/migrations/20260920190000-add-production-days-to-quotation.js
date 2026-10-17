"use strict";

// Días hábiles que toma la producción una vez aprobado el diseño —
// informativo, se imprime en el PDF para que el cliente sepa qué esperar.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("quotation", "production_days", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("quotation", "production_days");
  },
};

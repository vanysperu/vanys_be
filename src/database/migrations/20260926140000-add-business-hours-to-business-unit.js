"use strict";

// Horario de atención por tienda (pedido explícito del usuario): días
// laborales + de qué hora a qué hora. Vive directo en "business_unit" (no
// como fila de "Variables Generales") porque es un atributo propio de la
// tienda, no un catálogo compartido — igual criterio que primary_color/
// secondary_color, que ya son columnas propias acá.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("business_unit", "working_days", {
      type: Sequelize.STRING(20),
      allowNull: true,
      comment: "Días laborales, ISO 1=lunes..7=domingo, separados por coma (ej. '1,2,3,4,5')",
    });
    await queryInterface.addColumn("business_unit", "opens_at", {
      type: Sequelize.STRING(5),
      allowNull: true,
      comment: "Hora de apertura, formato HH:mm (ej. '09:00')",
    });
    await queryInterface.addColumn("business_unit", "closes_at", {
      type: Sequelize.STRING(5),
      allowNull: true,
      comment: "Hora de cierre, formato HH:mm (ej. '18:00')",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("business_unit", "closes_at");
    await queryInterface.removeColumn("business_unit", "opens_at");
    await queryInterface.removeColumn("business_unit", "working_days");
  },
};

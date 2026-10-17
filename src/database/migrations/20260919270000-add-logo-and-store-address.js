"use strict";

// Dato que faltaba para poder armar el PDF de una cotización con la
// dirección de la tienda específica (business_unit) — el logo, RUC, razón
// social, dirección y teléfono de la EMPRESA ya existían en `company`
// desde antes (logo_url, bank_name, yape_number, footer_line_1/2, etc. —
// ese esquema ya estaba pensado para esto, no hacía falta una tabla nueva).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("business_unit", "address", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("business_unit", "address");
  },
};

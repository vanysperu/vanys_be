"use strict";

// Una cotización puede pedirse "a nombre de" otra persona/empresa distinta
// al cliente registrado (ej. el cliente final de su propio cliente) — el
// client_id vinculado NUNCA cambia (sigue siendo la fuente del historial),
// esto solo afecta lo que se imprime en el PDF.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("quotation", "billing_name", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
    await queryInterface.addColumn("quotation", "billing_document_number", {
      type: Sequelize.STRING(20),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("quotation", "billing_name");
    await queryInterface.removeColumn("quotation", "billing_document_number");
  },
};

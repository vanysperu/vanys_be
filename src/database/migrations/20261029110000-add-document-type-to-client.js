"use strict";

const { columnExists } = require("../migration-helpers");

// Antes "Documento" era un string libre sin validar formato ni largo
// (permitía letras y más de 12 dígitos sin avisar) — pedido explícito del
// usuario: que exista un selector de "Tipo de documento" (mismo catálogo
// global que ya usan los usuarios, general_variable category="document_type")
// y que el largo se valide según el tipo elegido.
module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await columnExists(queryInterface, "client", "document_type"))) {
      await queryInterface.addColumn("client", "document_type", {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    // Clientes que ya existían (bases en producción con datos): el
    // validador exige tipo y número juntos, así que sin tipo no se podía
    // editar ni el teléfono de un cliente viejo. Se completa solo donde el
    // número no deja dudas: 8 dígitos = DNI ("1"), 11 dígitos = RUC ("6"),
    // códigos del catálogo document_type. El resto queda NULL y se elige al
    // editarlo. Solo toca filas sin tipo: repetirlo no cambia nada.
    await queryInterface.sequelize.query(
      "UPDATE client SET document_type = '1' WHERE document_type IS NULL AND document_number REGEXP '^[0-9]{8}$'"
    );
    await queryInterface.sequelize.query(
      "UPDATE client SET document_type = '6' WHERE document_type IS NULL AND document_number REGEXP '^[0-9]{11}$'"
    );
  },

  async down(queryInterface) {
    if (!(await columnExists(queryInterface, "client", "document_type"))) return;
    await queryInterface.removeColumn("client", "document_type");
  },
};

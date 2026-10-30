"use strict";

const { columnExists } = require("../migration-helpers");

// Antes "Documento" era un string libre sin validar formato ni largo
// (permitía letras y más de 12 dígitos sin avisar) — pedido explícito del
// usuario: que exista un selector de "Tipo de documento" (mismo catálogo
// global que ya usan los usuarios, general_variable category="document_type")
// y que el largo se valide según el tipo elegido.
module.exports = {
  async up(queryInterface, Sequelize) {
    if (await columnExists(queryInterface, "client", "document_type")) return;

    await queryInterface.addColumn("client", "document_type", {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    if (!(await columnExists(queryInterface, "client", "document_type"))) return;
    await queryInterface.removeColumn("client", "document_type");
  },
};

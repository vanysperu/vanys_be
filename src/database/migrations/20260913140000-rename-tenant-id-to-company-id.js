"use strict";

// `log.tenant_id` y `variable_general.tenant_id` eran el mismo concepto que
// `company_id` en el resto del esquema (company, business_unit, role) pero
// con un nombre distinto, heredado de antes de que se definiera "company"
// como el nombre único del tenant. Se unifican para que el esquema sea
// consistente.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.renameColumn("log", "tenant_id", "company_id");
    await queryInterface.renameColumn("variable_general", "tenant_id", "company_id");
  },

  async down(queryInterface) {
    await queryInterface.renameColumn("log", "company_id", "tenant_id");
    await queryInterface.renameColumn("variable_general", "company_id", "tenant_id");
  },
};

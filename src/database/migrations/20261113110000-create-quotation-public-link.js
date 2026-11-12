"use strict";

const { tableExists } = require("../migration-helpers");

// Sprint 2, ítem 7 (pedido explícito del usuario): "crear una vista para que el
// cliente pueda ver la cotización, así podremos enviarle por WhatsApp; debe
// poder verse sin logeo" y "un toggle que siempre esté en on: si lo ponemos off
// ya no la pueden ver".
//
//   quotation_public_link   un enlace por cotización: /c/<code>. El código es
//                           aleatorio (no el número de la cotización): con el
//                           número, cambiándolo cualquiera vería cotizaciones
//                           ajenas (decisión confirmada por el usuario).
//                           enabled = el interruptor (encendido por defecto).
//                           Las vistas cuentan cuándo la abrió el cliente.
const CREATE = `
    CREATE TABLE quotation_public_link (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      quotation_id BIGINT NOT NULL,
      code CHAR(22) NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      view_count INT NOT NULL DEFAULT 0,
      first_viewed_at DATETIME NULL,
      last_viewed_at DATETIME NULL,
      regenerated_at DATETIME NULL,
      created_by BIGINT NULL,
      created_at DATETIME NOT NULL,
      updated_by BIGINT NULL,
      updated_at DATETIME NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_quotation_public_link_quotation (quotation_id),
      UNIQUE KEY uq_quotation_public_link_code (code),
      KEY idx_quotation_public_link_company (company_id, created_at),
      CONSTRAINT fk_quotation_public_link_quotation_id FOREIGN KEY (quotation_id) REFERENCES quotation (id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_quotation_public_link_company_id FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB`;

module.exports = {
  async up(queryInterface) {
    if (await tableExists(queryInterface, "quotation_public_link")) return;
    await queryInterface.sequelize.query(CREATE);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query("DROP TABLE IF EXISTS quotation_public_link");
  },
};

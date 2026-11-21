"use strict";

const { tableExists } = require("../migration-helpers");

// Mockups (diseños) de una cotización (pedido del usuario, 21-nov): "poder
// subir los mockups y mirarlos en la cotización para saber los diseños y
// tenerlos a la vista". Solo los ve el equipo (decisión del usuario): nunca
// salen en el PDF ni en el enlace del cliente, y el archivo solo se entrega
// con sesión (GET /quotation/mockup/:id/file).
//
// El archivo va en la base (MEDIUMBLOB, hasta 16 MB; el tope real es 5 MB):
// el hosting borra el disco en cada despliegue. Los listados nunca leen `data`.
// `quotation_item_id` opcional: el diseño de un producto puntual o "General";
// si ese producto se quita de la cotización, el diseño queda como General.

const CREATE_QUOTATION_MOCKUP = `
    CREATE TABLE quotation_mockup (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      business_unit_id BIGINT NULL,
      quotation_id BIGINT NOT NULL,
      quotation_item_id BIGINT NULL,
      file_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(50) NOT NULL,
      size_bytes INT NOT NULL,
      data MEDIUMBLOB NOT NULL,
      caption VARCHAR(255) NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_by BIGINT NOT NULL,
      created_at DATETIME NOT NULL,
      updated_by BIGINT NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      KEY idx_quotation_mockup_quotation (quotation_id, active),
      KEY idx_quotation_mockup_company (company_id),
      KEY idx_quotation_mockup_business_unit (business_unit_id),
      KEY idx_quotation_mockup_item (quotation_item_id),
      KEY idx_quotation_mockup_created (created_at),
      CONSTRAINT fk_quotation_mockup_company_id FOREIGN KEY (company_id)
        REFERENCES company (id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_quotation_mockup_business_unit_id FOREIGN KEY (business_unit_id)
        REFERENCES business_unit (id) ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT fk_quotation_mockup_quotation_id FOREIGN KEY (quotation_id)
        REFERENCES quotation (id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_quotation_mockup_item_id FOREIGN KEY (quotation_item_id)
        REFERENCES quotation_item (id) ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT chk_quotation_mockup_size CHECK (size_bytes > 0)
    ) ENGINE = InnoDB`;

module.exports = {
  async up(queryInterface) {
    if (await tableExists(queryInterface, "quotation_mockup")) return;
    await queryInterface.sequelize.query(CREATE_QUOTATION_MOCKUP);
  },

  async down(queryInterface) {
    if (!(await tableExists(queryInterface, "quotation_mockup"))) return;
    await queryInterface.sequelize.query("DROP TABLE quotation_mockup");
  },
};

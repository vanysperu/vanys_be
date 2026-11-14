"use strict";

const { columnExists, indexExists, tableExists } = require("../migration-helpers");

// Sprint 2, ítem 1 (pedido del usuario): guía de remisión electrónica
// remitente, primero en MODO MANUAL (plan §9, opción C; decisiones D1 y D20).
// El sistema arma la guía (desde una cotización, una transferencia o de cero),
// el usuario la emite en SUNAT (SEE-SOL / App Emprender) y registra acá el
// número (serie T### - número) y el PDF. Nada se envía a SUNAT todavía.
//
// - company_sunat_settings: por ahora solo el modo de emisión (sin secretos;
//   las credenciales llegan con la emisión directa, al final del sprint).
// - transport_vehicle / transport_driver: catálogos por empresa.
// - dispatch_guide (+ líneas, transporte, documentos relacionados y archivo).
//   El archivo va en la base (LONGBLOB) y no en disco: Hostinger borra el
//   disco en cada despliegue.
// - stock_document.dispatch_guide_id: la salida de almacén que generó una guía
//   (D4: la venta descuenta al emitir la guía si la tienda lo eligió).
const AUDIT = `
      created_by BIGINT NULL,
      created_at DATETIME NOT NULL,
      updated_by BIGINT NULL,
      updated_at DATETIME NULL`;

const TABLES = {
  company_sunat_settings: `
    CREATE TABLE company_sunat_settings (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      emission_mode ENUM('manual', 'sunat_direct', 'pse') NOT NULL DEFAULT 'manual',${AUDIT},
      PRIMARY KEY (id),
      UNIQUE KEY uq_company_sunat_settings_company (company_id),
      CONSTRAINT fk_company_sunat_settings_company_id FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB`,

  transport_vehicle: `
    CREATE TABLE transport_vehicle (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      plate VARCHAR(10) NOT NULL,
      description VARCHAR(120) NULL,
      authorization_number VARCHAR(30) NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,${AUDIT},
      PRIMARY KEY (id),
      UNIQUE KEY uq_transport_vehicle_plate (company_id, plate),
      KEY idx_transport_vehicle_list (company_id, created_at),
      CONSTRAINT fk_transport_vehicle_company_id FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB`,

  transport_driver: `
    CREATE TABLE transport_driver (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      doc_type VARCHAR(2) NOT NULL DEFAULT '1',
      doc_number VARCHAR(15) NOT NULL,
      first_names VARCHAR(100) NOT NULL,
      last_names VARCHAR(100) NOT NULL,
      license_number VARCHAR(20) NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,${AUDIT},
      PRIMARY KEY (id),
      UNIQUE KEY uq_transport_driver_doc (company_id, doc_type, doc_number),
      KEY idx_transport_driver_list (company_id, created_at),
      CONSTRAINT fk_transport_driver_company_id FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB`,

  // series/number quedan en NULL mientras la guía es borrador: el número lo
  // da SUNAT al emitirla. El índice único (empresa, serie, número) frena un
  // número repetido (MySQL admite varios NULL).
  dispatch_guide: `
    CREATE TABLE dispatch_guide (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      business_unit_id BIGINT NULL,
      emission_mode ENUM('manual', 'sunat_direct', 'pse') NOT NULL DEFAULT 'manual',
      series VARCHAR(4) NULL,
      number INT NULL,
      status ENUM('draft', 'sending', 'accepted', 'rejected', 'error', 'manual', 'voided') NOT NULL DEFAULT 'draft',
      issue_date DATE NULL,
      transfer_start_date DATE NULL,
      reason_code CHAR(2) NOT NULL,
      reason_note VARCHAR(255) NULL,
      transport_mode ENUM('public', 'private') NOT NULL DEFAULT 'private',
      light_vehicle BOOLEAN NOT NULL DEFAULT FALSE,
      gross_weight_kg DECIMAL(12, 3) NULL,
      packages INT NULL,
      origin_warehouse_id BIGINT NULL,
      origin_address VARCHAR(255) NULL,
      origin_ubigeo CHAR(6) NULL,
      origin_establishment_code CHAR(4) NULL,
      destination_warehouse_id BIGINT NULL,
      destination_address VARCHAR(255) NULL,
      destination_ubigeo CHAR(6) NULL,
      destination_establishment_code CHAR(4) NULL,
      client_id BIGINT NULL,
      recipient_doc_type VARCHAR(2) NULL,
      recipient_doc_number VARCHAR(15) NULL,
      recipient_name VARCHAR(200) NULL,
      carrier_supplier_id BIGINT NULL,
      carrier_ruc VARCHAR(11) NULL,
      carrier_name VARCHAR(200) NULL,
      carrier_mtc_registration VARCHAR(30) NULL,
      quotation_id BIGINT NULL,
      stock_document_id BIGINT NULL,
      notes VARCHAR(500) NULL,
      registered_at DATETIME NULL,
      registered_by BIGINT NULL,
      voided_at DATETIME NULL,
      voided_by BIGINT NULL,
      void_reason VARCHAR(255) NULL,${AUDIT},
      PRIMARY KEY (id),
      UNIQUE KEY uq_dispatch_guide_number (company_id, series, number),
      KEY idx_dispatch_guide_list (company_id, created_at),
      KEY idx_dispatch_guide_store (company_id, business_unit_id, status),
      KEY idx_dispatch_guide_quotation (quotation_id),
      KEY idx_dispatch_guide_stock_document (stock_document_id),
      CONSTRAINT fk_dispatch_guide_company_id FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_dispatch_guide_business_unit_id FOREIGN KEY (business_unit_id) REFERENCES business_unit (id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_dispatch_guide_origin_warehouse_id FOREIGN KEY (origin_warehouse_id) REFERENCES warehouse (id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_dispatch_guide_destination_warehouse_id FOREIGN KEY (destination_warehouse_id) REFERENCES warehouse (id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_dispatch_guide_carrier_supplier_id FOREIGN KEY (carrier_supplier_id) REFERENCES supplier (id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_dispatch_guide_quotation_id FOREIGN KEY (quotation_id) REFERENCES quotation (id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_dispatch_guide_stock_document_id FOREIGN KEY (stock_document_id) REFERENCES stock_document (id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB`,

  dispatch_guide_line: `
    CREATE TABLE dispatch_guide_line (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      guide_id BIGINT NOT NULL,
      line_no INT NOT NULL,
      product_id BIGINT NULL,
      quotation_item_id BIGINT NULL,
      product_code VARCHAR(60) NULL,
      description VARCHAR(500) NOT NULL,
      color VARCHAR(60) NOT NULL DEFAULT '',
      quantity DECIMAL(14, 3) NOT NULL,
      unit_code VARCHAR(5) NOT NULL DEFAULT 'NIU',${AUDIT},
      PRIMARY KEY (id),
      KEY idx_dispatch_guide_line_guide (guide_id),
      KEY idx_dispatch_guide_line_item (quotation_item_id),
      CONSTRAINT fk_dispatch_guide_line_guide_id FOREIGN KEY (guide_id) REFERENCES dispatch_guide (id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_dispatch_guide_line_product_id FOREIGN KEY (product_id) REFERENCES product (id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB`,

  // Copia de los datos del vehículo/conductor al momento de la guía: si el
  // catálogo cambia después, la guía sigue diciendo lo que se declaró.
  dispatch_guide_transport: `
    CREATE TABLE dispatch_guide_transport (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      guide_id BIGINT NOT NULL,
      kind ENUM('vehicle', 'driver') NOT NULL,
      vehicle_id BIGINT NULL,
      driver_id BIGINT NULL,
      plate VARCHAR(10) NULL,
      driver_doc_type VARCHAR(2) NULL,
      driver_doc_number VARCHAR(15) NULL,
      driver_first_names VARCHAR(100) NULL,
      driver_last_names VARCHAR(100) NULL,
      license_number VARCHAR(20) NULL,
      is_main BOOLEAN NOT NULL DEFAULT TRUE,${AUDIT},
      PRIMARY KEY (id),
      KEY idx_dispatch_guide_transport_guide (guide_id),
      CONSTRAINT fk_dispatch_guide_transport_guide_id FOREIGN KEY (guide_id) REFERENCES dispatch_guide (id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB`,

  dispatch_guide_related_document: `
    CREATE TABLE dispatch_guide_related_document (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      guide_id BIGINT NOT NULL,
      doc_type VARCHAR(2) NOT NULL,
      series_number VARCHAR(30) NOT NULL,
      issuer_ruc VARCHAR(11) NULL,${AUDIT},
      PRIMARY KEY (id),
      KEY idx_dispatch_guide_related_guide (guide_id),
      CONSTRAINT fk_dispatch_guide_related_guide_id FOREIGN KEY (guide_id) REFERENCES dispatch_guide (id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB`,

  // Un archivo por tipo y guía (subir otro PDF lo reemplaza).
  dispatch_guide_file: `
    CREATE TABLE dispatch_guide_file (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      guide_id BIGINT NOT NULL,
      kind ENUM('xml', 'cdr', 'pdf') NOT NULL,
      file_name VARCHAR(200) NOT NULL,
      mime_type VARCHAR(60) NOT NULL,
      size_bytes INT NOT NULL,
      sha256 CHAR(64) NOT NULL,
      content LONGBLOB NOT NULL,${AUDIT},
      PRIMARY KEY (id),
      UNIQUE KEY uq_dispatch_guide_file_kind (guide_id, kind),
      CONSTRAINT fk_dispatch_guide_file_guide_id FOREIGN KEY (guide_id) REFERENCES dispatch_guide (id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB`,
};

// Orden de creación (por las FK) y el inverso para el down.
const ORDER = [
  "company_sunat_settings",
  "transport_vehicle",
  "transport_driver",
  "dispatch_guide",
  "dispatch_guide_line",
  "dispatch_guide_transport",
  "dispatch_guide_related_document",
  "dispatch_guide_file",
];

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    for (const table of ORDER) {
      if (!(await tableExists(queryInterface, table))) await sequelize.query(TABLES[table]);
    }
    if (!(await columnExists(queryInterface, "stock_document", "dispatch_guide_id"))) {
      await sequelize.query("ALTER TABLE stock_document ADD COLUMN dispatch_guide_id BIGINT NULL AFTER quotation_id");
    }
    if (!(await indexExists(queryInterface, "stock_document", "idx_stock_document_dispatch_guide"))) {
      await sequelize.query("CREATE INDEX idx_stock_document_dispatch_guide ON stock_document (dispatch_guide_id)");
    }
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;
    if (await indexExists(queryInterface, "stock_document", "idx_stock_document_dispatch_guide")) {
      await sequelize.query("DROP INDEX idx_stock_document_dispatch_guide ON stock_document");
    }
    if (await columnExists(queryInterface, "stock_document", "dispatch_guide_id")) {
      await sequelize.query("ALTER TABLE stock_document DROP COLUMN dispatch_guide_id");
    }
    for (const table of [...ORDER].reverse()) await sequelize.query(`DROP TABLE IF EXISTS ${table}`);
  },
};

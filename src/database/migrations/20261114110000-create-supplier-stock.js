"use strict";

const { tableExists } = require("../migration-helpers");

// Sprint 2, ítem 6 (pedido del usuario): las importadoras mandan un enlace a un
// Excel con su stock; al cotizar se ve cuánto tiene cada una (por separado) y la
// suma. Plan §7.
//
//   supplier_stock_source   de dónde sale el stock de un proveedor: enlace (o
//                           archivo subido), hoja, fila de encabezado y qué
//                           columna es el código, el color, la cantidad...
//   supplier_stock_import   historial de cada lectura (filas leídas, error).
//   supplier_stock_item     filas de la última lectura buena de cada fuente.
//
// Reemplazo atómico: las filas nuevas entran con su import_id y recién al
// terminar bien se marca la fuente con ese import y se borran las anteriores.
// Si algo falla, se sigue mostrando la última lectura buena.
const AUDIT = `
      created_by BIGINT NULL,
      created_at DATETIME NOT NULL,
      updated_by BIGINT NULL,
      updated_at DATETIME NULL`;

const CREATE_SOURCE = `
    CREATE TABLE supplier_stock_source (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      supplier_id BIGINT NOT NULL,
      name VARCHAR(120) NOT NULL,
      source_type ENUM('url', 'upload') NOT NULL DEFAULT 'url',
      url_encrypted TEXT NULL,
      sheet_name VARCHAR(100) NULL,
      header_row INT NOT NULL DEFAULT 1,
      column_map JSON NOT NULL,
      refresh_minutes INT NOT NULL DEFAULT 360,
      last_import_id BIGINT NULL,
      last_success_at DATETIME NULL,
      last_status ENUM('never', 'running', 'ok', 'error') NOT NULL DEFAULT 'never',
      last_error VARCHAR(500) NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,${AUDIT},
      PRIMARY KEY (id),
      KEY idx_stock_source_company (company_id, active, created_at),
      CONSTRAINT fk_stock_source_company_id FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_stock_source_supplier_id FOREIGN KEY (supplier_id) REFERENCES supplier (id) ON DELETE RESTRICT ON UPDATE RESTRICT
    ) ENGINE=InnoDB`;

const CREATE_IMPORT = `
    CREATE TABLE supplier_stock_import (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      source_id BIGINT NOT NULL,
      trigger_type ENUM('manual', 'upload', 'schedule') NOT NULL,
      started_at DATETIME NOT NULL,
      finished_at DATETIME NULL,
      status ENUM('running', 'ok', 'error') NOT NULL DEFAULT 'running',
      rows_read INT NOT NULL DEFAULT 0,
      rows_valid INT NOT NULL DEFAULT 0,
      file_sha256 CHAR(64) NULL,
      error VARCHAR(500) NULL,${AUDIT},
      PRIMARY KEY (id),
      KEY idx_stock_import_source (source_id, started_at),
      CONSTRAINT fk_stock_import_source_id FOREIGN KEY (source_id) REFERENCES supplier_stock_source (id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB`;

const CREATE_ITEM = `
    CREATE TABLE supplier_stock_item (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      source_id BIGINT NOT NULL,
      import_id BIGINT NOT NULL,
      code_raw VARCHAR(100) NOT NULL,
      code_norm VARCHAR(100) NOT NULL,
      color VARCHAR(100) NULL,
      description VARCHAR(255) NULL,
      quantity INT NULL,
      quantity_text VARCHAR(60) NULL,
      price DECIMAL(12, 4) NULL,${AUDIT},
      PRIMARY KEY (id),
      KEY idx_stock_item_code (company_id, code_norm),
      KEY idx_stock_item_import (source_id, import_id),
      CONSTRAINT fk_stock_item_source_id FOREIGN KEY (source_id) REFERENCES supplier_stock_source (id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB`;

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    if (!(await tableExists(queryInterface, "supplier_stock_source"))) await sequelize.query(CREATE_SOURCE);
    if (!(await tableExists(queryInterface, "supplier_stock_import"))) await sequelize.query(CREATE_IMPORT);
    if (!(await tableExists(queryInterface, "supplier_stock_item"))) await sequelize.query(CREATE_ITEM);
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;
    await sequelize.query("DROP TABLE IF EXISTS supplier_stock_item");
    await sequelize.query("DROP TABLE IF EXISTS supplier_stock_import");
    await sequelize.query("DROP TABLE IF EXISTS supplier_stock_source");
  },
};

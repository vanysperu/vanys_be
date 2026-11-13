"use strict";

const { columnExists, tableExists } = require("../migration-helpers");

// Sprint 2, ítem 2 (pedido del usuario): almacenes por tienda, "maneja stock"
// por producto, stock negativo, lotes y vencimiento por almacén, ingresos,
// salidas, transferencias, ajustes y kardex. Plan §8.
//
// Decisiones: D2 (stock por producto + color), D3 (costo promedio ponderado por
// empresa), D4 (la venta descuenta al entregar / al emitir la GRE, según la
// tienda), D5 (lotes y stock negativo no van juntos en un almacén), D14
// ("maneja stock": los productos existentes arrancan apagados).
//
// El color se guarda por NOMBRE (`color_key`, '' = sin color) y no por id:
// hoy guardar un producto borra y recrea sus colores (los ids cambian) y la
// cotización guarda el color como texto. Las claves de saldo no usan NULL
// (color_key '' y lot_key 0) para que el índice único funcione.
const AUDIT = `
      created_by BIGINT NULL,
      created_at DATETIME NOT NULL,
      updated_by BIGINT NULL,
      updated_at DATETIME NULL`;

const TABLES = {
  warehouse: `
    CREATE TABLE warehouse (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      business_unit_id BIGINT NULL,
      code VARCHAR(20) NOT NULL,
      name VARCHAR(120) NOT NULL,
      address VARCHAR(255) NULL,
      ubigeo CHAR(6) NULL,
      sunat_establishment_code CHAR(4) NULL,
      allow_negative_stock BOOLEAN NOT NULL DEFAULT FALSE,
      track_lots BOOLEAN NOT NULL DEFAULT FALSE,
      track_expiry BOOLEAN NOT NULL DEFAULT FALSE,
      expiry_alert_days INT NOT NULL DEFAULT 30,
      block_expired BOOLEAN NOT NULL DEFAULT TRUE,
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      is_transit BOOLEAN NOT NULL DEFAULT FALSE,
      active BOOLEAN NOT NULL DEFAULT TRUE,${AUDIT},
      PRIMARY KEY (id),
      UNIQUE KEY uq_warehouse_company_code (company_id, code),
      KEY idx_warehouse_store (company_id, business_unit_id, active),
      CONSTRAINT fk_warehouse_company_id FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_warehouse_business_unit_id FOREIGN KEY (business_unit_id) REFERENCES business_unit (id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB`,

  document_series: `
    CREATE TABLE document_series (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      document_type VARCHAR(20) NOT NULL,
      series VARCHAR(10) NOT NULL,
      next_number INT NOT NULL DEFAULT 1,${AUDIT},
      PRIMARY KEY (id),
      UNIQUE KEY uq_document_series (company_id, document_type, series),
      CONSTRAINT fk_document_series_company_id FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB`,

  stock_lot: `
    CREATE TABLE stock_lot (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      product_id BIGINT NOT NULL,
      color_key VARCHAR(60) NOT NULL DEFAULT '',
      lot_code VARCHAR(40) NOT NULL,
      expiry_date DATE NULL,
      supplier_id BIGINT NULL,${AUDIT},
      PRIMARY KEY (id),
      UNIQUE KEY uq_stock_lot (company_id, product_id, color_key, lot_code),
      KEY idx_stock_lot_expiry (company_id, expiry_date),
      CONSTRAINT fk_stock_lot_product_id FOREIGN KEY (product_id) REFERENCES product (id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB`,

  stock_document: `
    CREATE TABLE stock_document (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      business_unit_id BIGINT NULL,
      warehouse_id BIGINT NOT NULL,
      target_warehouse_id BIGINT NULL,
      doc_type ENUM('entry', 'exit', 'transfer', 'adjustment') NOT NULL,
      reason_code VARCHAR(30) NOT NULL,
      series VARCHAR(10) NOT NULL,
      number INT NOT NULL,
      status ENUM('draft', 'posted', 'dispatched', 'received', 'partially_received', 'cancelled') NOT NULL DEFAULT 'draft',
      document_date DATE NOT NULL,
      supplier_id BIGINT NULL,
      client_id BIGINT NULL,
      quotation_id BIGINT NULL,
      reversal_of_id BIGINT NULL,
      notes VARCHAR(500) NULL,
      posted_at DATETIME NULL,
      posted_by BIGINT NULL,
      received_at DATETIME NULL,
      received_by BIGINT NULL,
      cancelled_at DATETIME NULL,
      cancelled_by BIGINT NULL,
      cancel_reason VARCHAR(255) NULL,${AUDIT},
      PRIMARY KEY (id),
      UNIQUE KEY uq_stock_document_number (company_id, doc_type, series, number),
      KEY idx_stock_document_list (company_id, created_at),
      KEY idx_stock_document_warehouse (warehouse_id, status),
      KEY idx_stock_document_quotation (quotation_id),
      CONSTRAINT fk_stock_document_company_id FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_stock_document_warehouse_id FOREIGN KEY (warehouse_id) REFERENCES warehouse (id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_stock_document_target_id FOREIGN KEY (target_warehouse_id) REFERENCES warehouse (id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB`,

  stock_document_line: `
    CREATE TABLE stock_document_line (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      document_id BIGINT NOT NULL,
      product_id BIGINT NOT NULL,
      color_key VARCHAR(60) NOT NULL DEFAULT '',
      lot_id BIGINT NULL,
      lot_code VARCHAR(40) NULL,
      expiry_date DATE NULL,
      quantity DECIMAL(14, 3) NOT NULL,
      received_quantity DECIMAL(14, 3) NULL,
      unit_cost DECIMAL(14, 4) NULL,${AUDIT},
      PRIMARY KEY (id),
      KEY idx_stock_document_line_document (document_id),
      CONSTRAINT fk_stock_document_line_document_id FOREIGN KEY (document_id) REFERENCES stock_document (id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_stock_document_line_product_id FOREIGN KEY (product_id) REFERENCES product (id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB`,

  stock_movement: `
    CREATE TABLE stock_movement (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      warehouse_id BIGINT NOT NULL,
      product_id BIGINT NOT NULL,
      color_key VARCHAR(60) NOT NULL DEFAULT '',
      lot_key BIGINT NOT NULL DEFAULT 0,
      quantity DECIMAL(14, 3) NOT NULL,
      balance_after DECIMAL(14, 3) NOT NULL,
      unit_cost DECIMAL(14, 4) NULL,
      document_id BIGINT NOT NULL,
      document_line_id BIGINT NULL,
      movement_at DATETIME NOT NULL,${AUDIT},
      PRIMARY KEY (id),
      KEY idx_stock_movement_kardex (warehouse_id, product_id, color_key, movement_at, id),
      KEY idx_stock_movement_product (company_id, product_id, color_key, movement_at),
      KEY idx_stock_movement_document (document_id),
      CONSTRAINT fk_stock_movement_warehouse_id FOREIGN KEY (warehouse_id) REFERENCES warehouse (id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB`,

  stock_balance: `
    CREATE TABLE stock_balance (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      warehouse_id BIGINT NOT NULL,
      product_id BIGINT NOT NULL,
      color_key VARCHAR(60) NOT NULL DEFAULT '',
      lot_key BIGINT NOT NULL DEFAULT 0,
      on_hand DECIMAL(14, 3) NOT NULL DEFAULT 0,
      reserved DECIMAL(14, 3) NOT NULL DEFAULT 0,${AUDIT},
      PRIMARY KEY (id),
      UNIQUE KEY uq_stock_balance (warehouse_id, product_id, color_key, lot_key),
      KEY idx_stock_balance_product (company_id, product_id, color_key),
      CONSTRAINT fk_stock_balance_warehouse_id FOREIGN KEY (warehouse_id) REFERENCES warehouse (id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB`,

  // D3: costo promedio ponderado por producto y color a nivel EMPRESA.
  stock_cost: `
    CREATE TABLE stock_cost (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      product_id BIGINT NOT NULL,
      color_key VARCHAR(60) NOT NULL DEFAULT '',
      avg_cost DECIMAL(14, 4) NOT NULL DEFAULT 0,${AUDIT},
      PRIMARY KEY (id),
      UNIQUE KEY uq_stock_cost (company_id, product_id, color_key)
    ) ENGINE=InnoDB`,
};

// Orden de creación (por las FK) y el inverso para el down.
const ORDER = ["warehouse", "document_series", "stock_lot", "stock_document", "stock_document_line", "stock_movement", "stock_balance", "stock_cost"];

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    for (const table of ORDER) {
      if (!(await tableExists(queryInterface, table))) await sequelize.query(TABLES[table]);
    }

    // Tienda: "Usa almacén" y cuándo una venta descuenta el stock (D4).
    if (!(await columnExists(queryInterface, "business_unit", "inventory_enabled"))) {
      await sequelize.query("ALTER TABLE business_unit ADD COLUMN inventory_enabled BOOLEAN NOT NULL DEFAULT FALSE");
    }
    if (!(await columnExists(queryInterface, "business_unit", "inventory_exit_on"))) {
      await sequelize.query(
        "ALTER TABLE business_unit ADD COLUMN inventory_exit_on ENUM('delivered', 'dispatch_guide') NOT NULL DEFAULT 'delivered'"
      );
    }
    // Producto: "Maneja stock" (D14: los existentes apagados; los nuevos los
    // crea encendidos el service) y "perecible" (pide vencimiento).
    if (!(await columnExists(queryInterface, "product", "tracks_stock"))) {
      await sequelize.query("ALTER TABLE product ADD COLUMN tracks_stock BOOLEAN NOT NULL DEFAULT FALSE");
    }
    if (!(await columnExists(queryInterface, "product", "is_perishable"))) {
      await sequelize.query("ALTER TABLE product ADD COLUMN is_perishable BOOLEAN NOT NULL DEFAULT FALSE");
    }
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;
    for (const column of ["tracks_stock", "is_perishable"]) {
      if (await columnExists(queryInterface, "product", column)) await sequelize.query(`ALTER TABLE product DROP COLUMN ${column}`);
    }
    for (const column of ["inventory_enabled", "inventory_exit_on"]) {
      if (await columnExists(queryInterface, "business_unit", column)) {
        await sequelize.query(`ALTER TABLE business_unit DROP COLUMN ${column}`);
      }
    }
    for (const table of [...ORDER].reverse()) await sequelize.query(`DROP TABLE IF EXISTS ${table}`);
  },
};

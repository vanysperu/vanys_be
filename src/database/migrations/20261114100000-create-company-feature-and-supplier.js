"use strict";

const { columnExists, constraintExists, indexExists, tableExists } = require("../migration-helpers");

// Base común del Sprint 2 (plan §3.1 y §3.2), la necesita primero el ítem 6
// (stock de proveedores) y después las compras (3), el almacén (2) y la GRE (1).
//
//   company_feature   funcionalidades contratadas por empresa (las prende el
//                     Super Administrador en Empresas). El rol sigue decidiendo
//                     qué usuario las usa (RBAC sin cambios).
//   supplier          proveedores de la empresa (módulo mínimo, decisión D7).
//
// product_code: hasta ahora el proveedor era texto libre y el código era único
// en toda la empresa. Decisión D6: el código es único POR PROVEEDOR (dos
// importadoras pueden usar el mismo código para productos distintos). Se crea
// un proveedor por cada texto distinto de cada empresa y se enlaza; el texto se
// conserva (es el nombre del proveedor al momento de guardar el código).
const AUDIT = `
      created_by BIGINT NULL,
      created_at DATETIME NOT NULL,
      updated_by BIGINT NULL,
      updated_at DATETIME NULL`;

const CREATE_COMPANY_FEATURE = `
    CREATE TABLE company_feature (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      feature_code VARCHAR(40) NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      settings JSON NULL,${AUDIT},
      PRIMARY KEY (id),
      UNIQUE KEY uq_company_feature (company_id, feature_code),
      CONSTRAINT fk_company_feature_company_id FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB`;

const CREATE_SUPPLIER = `
    CREATE TABLE supplier (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      document_type BIGINT NULL,
      document_number VARCHAR(20) NULL,
      name VARCHAR(200) NOT NULL,
      trade_name VARCHAR(200) NULL,
      email VARCHAR(150) NULL,
      phone VARCHAR(30) NULL,
      address VARCHAR(255) NULL,
      is_carrier BOOLEAN NOT NULL DEFAULT FALSE,
      mtc_registration VARCHAR(30) NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,${AUDIT},
      PRIMARY KEY (id),
      UNIQUE KEY uq_supplier_company_name (company_id, name),
      UNIQUE KEY uq_supplier_company_document (company_id, document_number),
      KEY idx_supplier_company_created (company_id, created_at),
      CONSTRAINT fk_supplier_company_id FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB`;

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    if (!(await tableExists(queryInterface, "company_feature"))) await sequelize.query(CREATE_COMPANY_FEATURE);
    if (!(await tableExists(queryInterface, "supplier"))) await sequelize.query(CREATE_SUPPLIER);

    if (!(await columnExists(queryInterface, "product_code", "supplier_id"))) {
      await sequelize.query("ALTER TABLE product_code ADD COLUMN supplier_id BIGINT NULL AFTER code");

      // Un proveedor por cada texto distinto de cada empresa (la comparación de
      // MySQL no distingue mayúsculas: "ACME" y "Acme" son el mismo).
      await sequelize.query(
        `INSERT IGNORE INTO supplier (company_id, name, is_carrier, active, created_at, updated_at)
         SELECT pc.company_id, MIN(TRIM(pc.supplier)), FALSE, TRUE, NOW(), NOW()
         FROM product_code pc
         WHERE pc.supplier IS NOT NULL AND TRIM(pc.supplier) <> ''
         GROUP BY pc.company_id, TRIM(pc.supplier)`
      );
      await sequelize.query(
        `UPDATE product_code pc
         INNER JOIN supplier s ON s.company_id = pc.company_id AND s.name = TRIM(pc.supplier)
         SET pc.supplier_id = s.id
         WHERE pc.supplier IS NOT NULL AND TRIM(pc.supplier) <> ''`
      );
    }

    // RESTRICT (no SET NULL): MySQL no deja que la base de una columna generada
    // (supplier_key) tenga una FK con SET NULL/CASCADE. Los proveedores nunca se
    // borran (se deshabilitan), así que no cambia nada en la práctica.
    if (!(await constraintExists(queryInterface, "product_code", "fk_product_code_supplier_id"))) {
      await sequelize.query(
        `ALTER TABLE product_code ADD CONSTRAINT fk_product_code_supplier_id
         FOREIGN KEY (supplier_id) REFERENCES supplier (id) ON DELETE RESTRICT ON UPDATE RESTRICT`
      );
    }

    // Clave de unicidad: sin proveedor cuenta como "proveedor 0", así los
    // códigos sin proveedor tampoco se repiten dentro de la empresa.
    if (!(await columnExists(queryInterface, "product_code", "supplier_key"))) {
      await sequelize.query(
        "ALTER TABLE product_code ADD COLUMN supplier_key BIGINT AS (COALESCE(supplier_id, 0)) STORED AFTER supplier_id"
      );
    }
    if (!(await indexExists(queryInterface, "product_code", "uq_product_code_supplier_code"))) {
      await queryInterface.addIndex("product_code", {
        fields: ["company_id", "supplier_key", "code"],
        unique: true,
        name: "uq_product_code_supplier_code",
      });
    }
    // La búsqueda por código (sin proveedor) sigue necesitando su índice.
    if (!(await indexExists(queryInterface, "product_code", "idx_product_code_company_code"))) {
      await queryInterface.addIndex("product_code", { fields: ["company_id", "code"], name: "idx_product_code_company_code" });
    }
    if (await indexExists(queryInterface, "product_code", "uq_product_code_company_code")) {
      await queryInterface.removeIndex("product_code", "uq_product_code_company_code");
    }
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;
    // Ojo: si ya hay el mismo código con dos proveedores, volver al índice
    // único por empresa falla; hay que resolver esos códigos a mano antes.
    if (!(await indexExists(queryInterface, "product_code", "uq_product_code_company_code"))) {
      await queryInterface.addIndex("product_code", { fields: ["company_id", "code"], unique: true, name: "uq_product_code_company_code" });
    }
    if (await indexExists(queryInterface, "product_code", "uq_product_code_supplier_code")) {
      await queryInterface.removeIndex("product_code", "uq_product_code_supplier_code");
    }
    if (await columnExists(queryInterface, "product_code", "supplier_key")) {
      await sequelize.query("ALTER TABLE product_code DROP COLUMN supplier_key");
    }
    if (await columnExists(queryInterface, "product_code", "supplier_id")) {
      if (await constraintExists(queryInterface, "product_code", "fk_product_code_supplier_id")) {
        await sequelize.query("ALTER TABLE product_code DROP FOREIGN KEY fk_product_code_supplier_id");
      }
      await sequelize.query("ALTER TABLE product_code DROP COLUMN supplier_id");
    }
    await sequelize.query("DROP TABLE IF EXISTS supplier");
    await sequelize.query("DROP TABLE IF EXISTS company_feature");
  },
};

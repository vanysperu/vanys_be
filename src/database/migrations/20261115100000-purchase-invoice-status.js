"use strict";

const { columnExists, constraintExists, indexExists } = require("../migration-helpers");

// Sprint 2, ítem 3 (compras sin factura):
// - purchase_order_item_purchase.invoice_status: "linked" (ya está en una
//   factura), "pending" (la factura llega después: sale en la bandeja
//   "Compras sin factura") o "not_required" (no lleva factura). Las compras con
//   factura pasan a linked y las demás a not_required (antes solo había Sí/No).
// - Datos opcionales de la factura de compra (D9): proveedor, serie-número,
//   fecha de emisión, moneda y total. Se buscan por número o proveedor y se
//   avisa si se repite proveedor + serie-número (índice no único: el aviso se
//   puede confirmar).
module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;

    if (!(await columnExists(queryInterface, "purchase_order_item_purchase", "invoice_status"))) {
      await sequelize.query(
        `ALTER TABLE purchase_order_item_purchase
         ADD COLUMN invoice_status ENUM('linked','pending','not_required') NOT NULL DEFAULT 'not_required' AFTER paid_by_user_id`
      );
      await sequelize.query(
        `UPDATE purchase_order_item_purchase pop
         INNER JOIN invoice_purchase ip ON ip.purchase_id = pop.id
         SET pop.invoice_status = 'linked'`
      );
    }
    if (!(await indexExists(queryInterface, "purchase_order_item_purchase", "idx_purchase_invoice_status"))) {
      await queryInterface.addIndex("purchase_order_item_purchase", {
        fields: ["invoice_status", "is_deleted", "created_at"],
        name: "idx_purchase_invoice_status",
      });
    }

    if (!(await columnExists(queryInterface, "invoice", "supplier_id"))) {
      await sequelize.query(
        `ALTER TABLE invoice
         ADD COLUMN supplier_id BIGINT NULL AFTER quotation_id,
         ADD COLUMN series_number VARCHAR(30) NULL AFTER supplier_id,
         ADD COLUMN issue_date DATE NULL AFTER series_number,
         ADD COLUMN currency ENUM('PEN','USD') NULL AFTER issue_date,
         ADD COLUMN total DECIMAL(12,2) NULL AFTER currency`
      );
    }
    if (!(await constraintExists(queryInterface, "invoice", "fk_invoice_supplier"))) {
      await sequelize.query(
        "ALTER TABLE invoice ADD CONSTRAINT fk_invoice_supplier FOREIGN KEY (supplier_id) REFERENCES supplier(id) ON DELETE RESTRICT"
      );
    }
    if (!(await indexExists(queryInterface, "invoice", "idx_invoice_supplier_number"))) {
      await queryInterface.addIndex("invoice", { fields: ["company_id", "supplier_id", "series_number"], name: "idx_invoice_supplier_number" });
    }
    if (!(await indexExists(queryInterface, "invoice", "idx_invoice_company_number"))) {
      await queryInterface.addIndex("invoice", { fields: ["company_id", "series_number"], name: "idx_invoice_company_number" });
    }
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;
    if (await indexExists(queryInterface, "invoice", "idx_invoice_company_number")) {
      await queryInterface.removeIndex("invoice", "idx_invoice_company_number");
    }
    if (await constraintExists(queryInterface, "invoice", "fk_invoice_supplier")) {
      await sequelize.query("ALTER TABLE invoice DROP FOREIGN KEY fk_invoice_supplier");
    }
    if (await indexExists(queryInterface, "invoice", "idx_invoice_supplier_number")) {
      await queryInterface.removeIndex("invoice", "idx_invoice_supplier_number");
    }
    if (await columnExists(queryInterface, "invoice", "supplier_id")) {
      await sequelize.query(
        "ALTER TABLE invoice DROP COLUMN supplier_id, DROP COLUMN series_number, DROP COLUMN issue_date, DROP COLUMN currency, DROP COLUMN total"
      );
    }
    if (await indexExists(queryInterface, "purchase_order_item_purchase", "idx_purchase_invoice_status")) {
      await queryInterface.removeIndex("purchase_order_item_purchase", "idx_purchase_invoice_status");
    }
    if (await columnExists(queryInterface, "purchase_order_item_purchase", "invoice_status")) {
      await sequelize.query("ALTER TABLE purchase_order_item_purchase DROP COLUMN invoice_status");
    }
  },
};

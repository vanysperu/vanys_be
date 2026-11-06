"use strict";

const { columnExists, constraintExists, tableExists } = require("../migration-helpers");

// Una factura de compra puede cubrir VARIAS compras (pedido explícito del
// usuario: "en una factura pueden estar varios productos"). Antes cada compra
// tenía su propia factura (invoice.purchase_id); ahora el vínculo va en la
// tabla puente invoice_purchase: una factura → N compras, y cada compra está a
// lo sumo en una factura (purchase_id UNIQUE).
//
// Se pasan los vínculos que ya existían y se quita la columna vieja, para que
// haya una sola fuente de verdad.
module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, "invoice_purchase"))) {
      await queryInterface.createTable("invoice_purchase", {
        id: { type: Sequelize.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
        invoice_id: { type: Sequelize.BIGINT, allowNull: false },
        purchase_id: { type: Sequelize.BIGINT, allowNull: false, unique: true },
        company_id: { type: Sequelize.BIGINT, allowNull: false },
        created_by: { type: Sequelize.BIGINT, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updated_by: { type: Sequelize.BIGINT, allowNull: true },
        updated_at: { type: Sequelize.DATE, allowNull: true },
      });
      await queryInterface.addConstraint("invoice_purchase", {
        fields: ["invoice_id"],
        type: "foreign key",
        name: "fk_invoice_purchase_invoice_id",
        references: { table: "invoice", field: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });
      await queryInterface.addConstraint("invoice_purchase", {
        fields: ["purchase_id"],
        type: "foreign key",
        name: "fk_invoice_purchase_purchase_id",
        references: { table: "purchase_order_item_purchase", field: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });
      await queryInterface.addConstraint("invoice_purchase", {
        fields: ["company_id"],
        type: "foreign key",
        name: "fk_invoice_purchase_company_id",
        references: { table: "company", field: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });
      await queryInterface.addIndex("invoice_purchase", { fields: ["invoice_id"], name: "idx_invoice_purchase_invoice" });
    }

    if (!(await columnExists(queryInterface, "invoice", "purchase_id"))) return;

    await queryInterface.sequelize.query(
      `INSERT INTO invoice_purchase (invoice_id, purchase_id, company_id, created_by, created_at, updated_by, updated_at)
       SELECT i.id, i.purchase_id, i.company_id, i.created_by, i.created_at, i.updated_by, i.updated_at
       FROM invoice i
       WHERE i.purchase_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM invoice_purchase ip WHERE ip.purchase_id = i.purchase_id)`
    );
    if (await constraintExists(queryInterface, "invoice", "fk_invoice_purchase_id")) {
      await queryInterface.removeConstraint("invoice", "fk_invoice_purchase_id");
    }
    await queryInterface.removeColumn("invoice", "purchase_id");
  },

  async down(queryInterface, Sequelize) {
    if (!(await columnExists(queryInterface, "invoice", "purchase_id"))) {
      await queryInterface.addColumn("invoice", "purchase_id", { type: Sequelize.BIGINT, allowNull: true });
    }
    if (!(await tableExists(queryInterface, "invoice_purchase"))) return;
    // Vuelve a una compra por factura: se queda con la primera de cada una.
    await queryInterface.sequelize.query(
      `UPDATE invoice i
       INNER JOIN (SELECT invoice_id, MIN(purchase_id) AS purchase_id FROM invoice_purchase GROUP BY invoice_id) ip
         ON ip.invoice_id = i.id
       SET i.purchase_id = ip.purchase_id`
    );
    await queryInterface.dropTable("invoice_purchase");
  },
};

"use strict";

const { tableExists } = require("../migration-helpers");

// Códigos adicionales de un producto (pedido explícito del usuario: "un
// producto puede tener diferentes códigos pero solo un SKU", porque cada
// proveedor lo identifica con su propio código). El SKU sigue siendo el
// código propio y único del producto (y la llave de la subida masiva); estos
// son los códigos de proveedores, con el nombre del proveedor opcional.
module.exports = {
  async up(queryInterface, Sequelize) {
    if (await tableExists(queryInterface, "product_code")) return;

    await queryInterface.createTable("product_code", {
      id: { type: Sequelize.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: Sequelize.BIGINT, allowNull: false },
      product_id: { type: Sequelize.BIGINT, allowNull: false },
      code: { type: Sequelize.STRING(60), allowNull: false },
      supplier: { type: Sequelize.STRING(150), allowNull: true },
      position: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_by: { type: Sequelize.BIGINT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_by: { type: Sequelize.BIGINT, allowNull: true },
      updated_at: { type: Sequelize.DATE, allowNull: true },
    });
    await queryInterface.addConstraint("product_code", {
      fields: ["product_id"],
      type: "foreign key",
      name: "fk_product_code_product_id",
      references: { table: "product", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    await queryInterface.addConstraint("product_code", {
      fields: ["company_id"],
      type: "foreign key",
      name: "fk_product_code_company_id",
      references: { table: "company", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    await queryInterface.addIndex("product_code", { fields: ["product_id", "position"], name: "idx_product_code_product" });
    // Buscar un producto por el código de un proveedor dentro de una empresa.
    await queryInterface.addIndex("product_code", { fields: ["company_id", "code"], name: "idx_product_code_company_code" });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("product_code");
  },
};

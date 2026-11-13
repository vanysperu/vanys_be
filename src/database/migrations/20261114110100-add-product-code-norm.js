"use strict";

const { columnExists, indexExists } = require("../migration-helpers");

// Sprint 2, ítem 6: el stock del Excel se cruza con los productos por código
// normalizado (mayúsculas, sin espacios, guiones, puntos, guiones bajos ni
// barras): "e1000-02" = "E1000.02" = "E100002". MySQL calcula la columna y la
// indexa, así el cruce no recorre todos los códigos en memoria. Misma regla
// que normalizeCode() en supplier_stock/services/shared/stock_parsing.ts.
const normExpression = (column) =>
  `UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${column}, ' ', ''), '-', ''), '.', ''), '_', ''), '/', ''), '\\\\', ''))`;

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    if (!(await columnExists(queryInterface, "product_code", "code_norm"))) {
      await sequelize.query(`ALTER TABLE product_code ADD COLUMN code_norm VARCHAR(60) AS (${normExpression("code")}) STORED`);
    }
    if (!(await indexExists(queryInterface, "product_code", "idx_product_code_company_norm"))) {
      await queryInterface.addIndex("product_code", { fields: ["company_id", "code_norm"], name: "idx_product_code_company_norm" });
    }
    if (!(await columnExists(queryInterface, "product", "sku_norm"))) {
      await sequelize.query(`ALTER TABLE product ADD COLUMN sku_norm VARCHAR(100) AS (${normExpression("sku")}) STORED`);
    }
    if (!(await indexExists(queryInterface, "product", "idx_product_company_sku_norm"))) {
      await queryInterface.addIndex("product", { fields: ["company_id", "sku_norm"], name: "idx_product_company_sku_norm" });
    }
  },

  async down(queryInterface) {
    if (await indexExists(queryInterface, "product", "idx_product_company_sku_norm")) {
      await queryInterface.removeIndex("product", "idx_product_company_sku_norm");
    }
    if (await columnExists(queryInterface, "product", "sku_norm")) {
      await queryInterface.sequelize.query("ALTER TABLE product DROP COLUMN sku_norm");
    }
    if (await indexExists(queryInterface, "product_code", "idx_product_code_company_norm")) {
      await queryInterface.removeIndex("product_code", "idx_product_code_company_norm");
    }
    if (await columnExists(queryInterface, "product_code", "code_norm")) {
      await queryInterface.sequelize.query("ALTER TABLE product_code DROP COLUMN code_norm");
    }
  },
};

"use strict";

const { indexExists } = require("../migration-helpers");

const INDEX_NAME = "idx_product_company_price_hundred";

// La API pública ordena el catálogo por precio por ciento (pedido de la web,
// orderBy=price_hundred). Índice por empresa + precio, igual que el de SKU
// (CLAUDE.md §4: índice en las columnas de ORDER BY).
module.exports = {
  async up(queryInterface) {
    if (await indexExists(queryInterface, "product", INDEX_NAME)) return;
    await queryInterface.addIndex("product", { fields: ["company_id", "price_hundred"], name: INDEX_NAME });
  },

  async down(queryInterface) {
    if (!(await indexExists(queryInterface, "product", INDEX_NAME))) return;
    await queryInterface.removeIndex("product", INDEX_NAME);
  },
};

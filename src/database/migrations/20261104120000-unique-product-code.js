"use strict";

const { indexExists } = require("../migration-helpers");

// Los códigos de proveedores no pueden repetirse (pedido explícito del
// usuario): un código identifica a UN solo producto dentro de la empresa. La
// base lo garantiza con un índice único (company_id, code); la colación de
// MySQL no distingue mayúsculas, así que "zx-1" y "ZX-1" chocan. Entre
// empresas distintas sí puede repetirse (la réplica copia los códigos a cada
// empresa).
module.exports = {
  async up(queryInterface) {
    if (await indexExists(queryInterface, "product_code", "uq_product_code_company_code")) return;

    // Si ya hubiera códigos repetidos, se detiene con el detalle en vez de
    // borrar datos por su cuenta: hay que decidir a mano cuál queda.
    const [duplicates] = await queryInterface.sequelize.query(
      `SELECT company_id, code, COUNT(*) AS total
       FROM product_code
       GROUP BY company_id, code
       HAVING COUNT(*) > 1
       LIMIT 20`
    );
    if (duplicates.length > 0) {
      const detail = duplicates.map((row) => `empresa ${row.company_id}: "${row.code}" (${row.total})`).join("; ");
      throw new Error(`Hay códigos de producto repetidos; corrígelos antes de migrar: ${detail}`);
    }

    await queryInterface.addIndex("product_code", {
      fields: ["company_id", "code"],
      unique: true,
      name: "uq_product_code_company_code",
    });
    // El índice único ya cubre la búsqueda por código: el anterior sobra.
    if (await indexExists(queryInterface, "product_code", "idx_product_code_company_code")) {
      await queryInterface.removeIndex("product_code", "idx_product_code_company_code");
    }
  },

  async down(queryInterface) {
    if (!(await indexExists(queryInterface, "product_code", "idx_product_code_company_code"))) {
      await queryInterface.addIndex("product_code", { fields: ["company_id", "code"], name: "idx_product_code_company_code" });
    }
    await queryInterface.removeIndex("product_code", "uq_product_code_company_code");
  },
};

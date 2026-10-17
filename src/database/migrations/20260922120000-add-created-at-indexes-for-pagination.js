"use strict";

// CLAUDE.md sección 4/8: todo endpoint de listado paginado ordena por
// `created_at` por default -- este índice evita un table scan en cada
// listado de estas tablas (antes solo tenían índices sobre FKs, no sobre
// la columna usada en el ORDER BY por defecto). `purchase_order` y
// `quotation` ya se listan bastante seguido (dashboards de operación), de
// ahí que se incluyan también.
const TABLES_NEEDING_CREATED_AT_INDEX = [
  "company",
  "business_unit",
  "client",
  "product",
  "customization_technique",
  "purchase_order",
  "quotation",
  "resources",
  "general_variable",
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    for (const table of TABLES_NEEDING_CREATED_AT_INDEX) {
      const indexName = `${table}_created_at_idx`;
      // Idempotente: un intento previo pudo haber creado el índice sin que
      // quedara registrado en SequelizeMeta -- se evita el duplicate-key error.
      const [existing] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM \`${table}\` WHERE Key_name = '${indexName}'`,
      );
      if (existing.length > 0) continue;

      await queryInterface.addIndex(table, {
        fields: ["created_at"],
        name: indexName,
      });
    }
  },

  async down(queryInterface) {
    for (const table of TABLES_NEEDING_CREATED_AT_INDEX) {
      await queryInterface.removeIndex(table, `${table}_created_at_idx`);
    }
  },
};

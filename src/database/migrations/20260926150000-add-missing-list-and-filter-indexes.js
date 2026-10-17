"use strict";

// Revisión completa de índices (CLAUDE.md secciones 4/8/12): se detectaron
// columnas usadas en WHERE/ORDER BY de listados paginados que quedaron sin
// índice porque la migración `add-created-at-indexes-for-pagination` no
// cubrió `user`/`role` (ambas listan por `created_at` por defecto) ni los
// filtros de `general_variable` (`company_id` para el aislamiento
// multi-tenant, `category` para el filtro de catálogo por categoría).
// NOTA: `general_variable_company_id_idx` y el filtro por categoría ya
// quedaron cubiertos por una migración previa de esta misma sesión
// (`add-missing-indexes-audit`, índice compuesto `category`+`prefix_id`) —
// no se repite acá para no dejar un índice redundante sobre las mismas
// columnas.
const INDEXES = [
  { table: "user", fields: ["created_at"], name: "user_created_at_idx" },
  { table: "role", fields: ["created_at"], name: "role_created_at_idx" },
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    for (const { table, fields, name } of INDEXES) {
      // Idempotente, mismo patrón que la migración de índices previa: evita
      // el duplicate-key error si un intento anterior ya creó el índice.
      const [existing] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM \`${table}\` WHERE Key_name = '${name}'`,
      );
      if (existing.length > 0) continue;

      await queryInterface.addIndex(table, { fields, name });
    }
  },

  async down(queryInterface) {
    for (const { table, name } of INDEXES) {
      await queryInterface.removeIndex(table, name);
    }
    await queryInterface.sequelize.query(
      "SHOW INDEX FROM `general_variable` WHERE Key_name = 'general_variable_category_idx'",
    ).then(async ([rows]) => {
      if (rows.length > 0) await queryInterface.removeIndex("general_variable", "general_variable_category_idx");
    });
  },
};

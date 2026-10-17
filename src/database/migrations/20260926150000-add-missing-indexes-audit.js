"use strict";

// Auditoría de índices (CLAUDE.md secciones 4/8): revisando `SHOW INDEX`
// contra la base de desarrollo se detectó que estas columnas se usan en
// WHERE/ORDER BY seguido pero no tenían índice propio (a diferencia de las
// FKs, que MySQL ya auto-indexa al crear la constraint):
//  - `general_variable.company_id`: se filtra en CADA listado (aislamiento
//    multi-tenant, sección 10) y no tiene FK (company_id nullable = variable
//    global), así que MySQL nunca le creó un índice automático.
//  - `general_variable(category, prefix_id)`: se busca por este par exacto
//    en getIgvRate/quotation_validity (configuración por categoría+código).
//  - `log.company_id`: mismo aislamiento multi-tenant, sin índice.
//  - `log.created_at`: el listado de logs siempre ordena por esta columna y
//    además filtra por rango de fechas -- se quedó fuera de la migración
//    "add-created-at-indexes-for-pagination" anterior.
//  - `purchase_order.status`: es una columna sortable/filtrable propia
//    (ver purchase_order.service.ts) que solo estaba cubierta como segunda
//    columna del compuesto (assigned_to, status), inútil para un filtro por
//    status sin assigned_to.
// Idempotente igual que la migración de referencia (created-at-indexes):
// se chequea SHOW INDEX antes de crear cada índice para no fallar si ya
// existe (ej. reintento de esta misma migración).
const INDEXES_TO_ADD = [
  { table: "general_variable", name: "general_variable_company_id_idx", fields: ["company_id"] },
  { table: "general_variable", name: "general_variable_category_prefix_id_idx", fields: ["category", "prefix_id"] },
  { table: "log", name: "log_company_id_idx", fields: ["company_id"] },
  { table: "log", name: "log_created_at_idx", fields: ["created_at"] },
  { table: "purchase_order", name: "purchase_order_status_idx", fields: ["status"] },
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    for (const { table, name, fields } of INDEXES_TO_ADD) {
      const [existing] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM \`${table}\` WHERE Key_name = '${name}'`,
      );
      if (existing.length > 0) continue;

      await queryInterface.addIndex(table, { fields, name });
    }
  },

  async down(queryInterface) {
    for (const { table, name } of INDEXES_TO_ADD) {
      await queryInterface.removeIndex(table, name);
    }
  },
};

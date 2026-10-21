"use strict";

const { indexExists } = require("../migration-helpers");

// Índices para el módulo de Estadísticas (CLAUDE.md sección 8: índice en toda
// columna usada en WHERE). Sus consultas filtran por rango de fechas:
//   - cotizaciones por empresa + fecha de emisión,
//   - pagos por fecha de pago,
//   - gastos por fecha del gasto.
// (cash_movement ya tiene company_id + occurred_at.)
const INDEXES = [
  { table: "quotation", name: "idx_quotation_company_created", fields: ["company_id", "created_at"] },
  { table: "quotation_payment", name: "idx_quotation_payment_paid_at", fields: ["paid_at"] },
  { table: "quotation_expense", name: "idx_quotation_expense_spent_at", fields: ["spent_at"] },
];

module.exports = {
  async up(queryInterface) {
    for (const { table, name, fields } of INDEXES) {
      if (await indexExists(queryInterface, table, name)) continue;
      await queryInterface.addIndex(table, { fields, name });
    }
  },

  async down(queryInterface) {
    for (const { table, name } of INDEXES) {
      if (!(await indexExists(queryInterface, table, name))) continue;
      await queryInterface.removeIndex(table, name);
    }
  },
};

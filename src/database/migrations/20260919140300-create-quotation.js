"use strict";

// Estados de la cotización (flujo de estados, ver flujo de cotizacion +
// estados.pdf): pending -> accepted | rejected | expired; accepted ->
// design_pending -> in_process -> ready -> delivered -> finished; cancelled
// alcanzable desde accepted/design_pending/in_process. "expired" hoy se
// marca a mano (el auto-vencimiento a los 15 días queda para un cron
// posterior, aún no implementado).
const STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "expired",
  "design_pending",
  "in_process",
  "cancelled",
  "ready",
  "delivered",
  "finished",
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("quotation", {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
      company_id: { type: Sequelize.BIGINT, allowNull: false },
      business_unit_id: { type: Sequelize.BIGINT, allowNull: true },
      client_id: { type: Sequelize.BIGINT, allowNull: false },
      status: { type: Sequelize.ENUM(...STATUSES), allowNull: false, defaultValue: "pending" },
      total: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      // "Finalizada" depende de saldo pendiente = 0 (total - total_paid),
      // pero el módulo de Finanzas/Ingresos todavía no existe — por ahora
      // total_paid se puede tocar a mano y "finished" se marca manualmente,
      // no se deriva automáticamente de esta resta (ver quotation.service.ts).
      total_paid: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      notes: { type: Sequelize.TEXT, allowNull: true },
      valid_until: { type: Sequelize.DATEONLY, allowNull: true },
      is_deleted: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_by: { type: Sequelize.BIGINT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      updated_by: { type: Sequelize.BIGINT, allowNull: true },
      updated_at: { type: Sequelize.DATE, allowNull: true },
    });

    await queryInterface.addConstraint("quotation", {
      fields: ["company_id"],
      type: "foreign key",
      name: "fk_quotation_company_id",
      references: { table: "company", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    await queryInterface.addConstraint("quotation", {
      fields: ["business_unit_id"],
      type: "foreign key",
      name: "fk_quotation_business_unit_id",
      references: { table: "business_unit", field: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    await queryInterface.addConstraint("quotation", {
      fields: ["client_id"],
      type: "foreign key",
      name: "fk_quotation_client_id",
      references: { table: "client", field: "id" },
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
    await queryInterface.addIndex("quotation", { fields: ["company_id"] });
    await queryInterface.addIndex("quotation", { fields: ["client_id"] });
    await queryInterface.addIndex("quotation", { fields: ["status"] });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("quotation");
  },
};

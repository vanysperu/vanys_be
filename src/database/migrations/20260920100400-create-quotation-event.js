"use strict";

// Timeline de una cotización: qué pasó y quién lo hizo. Inmutable (nunca se
// edita un evento ya escrito) — mismo criterio que la tabla `log` genérica
// (que solo tiene created_date, sin updated), así que acá tampoco se
// incluyen updated_by/updated_at.
const { tableExists } = require("../migration-helpers");

module.exports = {
  async up(queryInterface, Sequelize) {
    // Idempotente: en una instalación desde cero la tabla ya la creó
    // 20260919140500-create-quotation-flow-tables-early (ver ahí el porqué).
    if (await tableExists(queryInterface, "quotation_event")) return;

    await queryInterface.createTable("quotation_event", {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
      quotation_id: { type: Sequelize.BIGINT, allowNull: false },
      action: { type: Sequelize.STRING(50), allowNull: false },
      description: { type: Sequelize.STRING(255), allowNull: false },
      created_by: { type: Sequelize.BIGINT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
    });

    await queryInterface.addConstraint("quotation_event", {
      fields: ["quotation_id"],
      type: "foreign key",
      name: "fk_quotation_event_quotation_id",
      references: { table: "quotation", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    await queryInterface.addIndex("quotation_event", { fields: ["quotation_id", "created_at"] });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("quotation_event");
  },
};

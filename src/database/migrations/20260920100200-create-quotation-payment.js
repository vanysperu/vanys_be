"use strict";

const { tableExists } = require("../migration-helpers");

module.exports = {
  async up(queryInterface, Sequelize) {
    // Idempotente: en una instalación desde cero la tabla ya la creó
    // 20260919140500-create-quotation-flow-tables-early (ver ahí el porqué).
    if (await tableExists(queryInterface, "quotation_payment")) return;

    await queryInterface.createTable("quotation_payment", {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
      quotation_id: { type: Sequelize.BIGINT, allowNull: false },
      amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      method: { type: Sequelize.STRING(50), allowNull: true },
      paid_at: { type: Sequelize.DATEONLY, allowNull: false },
      notes: { type: Sequelize.TEXT, allowNull: true },
      created_by: { type: Sequelize.BIGINT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      updated_by: { type: Sequelize.BIGINT, allowNull: true },
      updated_at: { type: Sequelize.DATE, allowNull: true },
    });

    await queryInterface.addConstraint("quotation_payment", {
      fields: ["quotation_id"],
      type: "foreign key",
      name: "fk_quotation_payment_quotation_id",
      references: { table: "quotation", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    await queryInterface.addIndex("quotation_payment", { fields: ["quotation_id"] });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("quotation_payment");
  },
};

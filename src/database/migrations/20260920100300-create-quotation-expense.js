"use strict";

const { tableExists } = require("../migration-helpers");

module.exports = {
  async up(queryInterface, Sequelize) {
    // Idempotente: en una instalación desde cero la tabla ya la creó
    // 20260919140500-create-quotation-flow-tables-early (ver ahí el porqué).
    if (await tableExists(queryInterface, "quotation_expense")) return;

    await queryInterface.createTable("quotation_expense", {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
      quotation_id: { type: Sequelize.BIGINT, allowNull: false },
      description: { type: Sequelize.STRING(255), allowNull: false },
      amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      category: { type: Sequelize.STRING(50), allowNull: true },
      spent_at: { type: Sequelize.DATEONLY, allowNull: false },
      created_by: { type: Sequelize.BIGINT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      updated_by: { type: Sequelize.BIGINT, allowNull: true },
      updated_at: { type: Sequelize.DATE, allowNull: true },
    });

    await queryInterface.addConstraint("quotation_expense", {
      fields: ["quotation_id"],
      type: "foreign key",
      name: "fk_quotation_expense_quotation_id",
      references: { table: "quotation", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    await queryInterface.addIndex("quotation_expense", { fields: ["quotation_id"] });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("quotation_expense");
  },
};

"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("client", {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
      // Multi-tenant (CLAUDE.md sección 10): un cliente pertenece a una
      // empresa; opcionalmente a una tienda específica de esa empresa.
      company_id: { type: Sequelize.BIGINT, allowNull: false },
      business_unit_id: { type: Sequelize.BIGINT, allowNull: true },
      name: { type: Sequelize.STRING(255), allowNull: false },
      document_number: { type: Sequelize.STRING(20), allowNull: true },
      email: { type: Sequelize.STRING(150), allowNull: true },
      phone: { type: Sequelize.STRING(30), allowNull: true },
      address: { type: Sequelize.STRING(255), allowNull: true },
      is_deleted: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_by: { type: Sequelize.BIGINT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      updated_by: { type: Sequelize.BIGINT, allowNull: true },
      updated_at: { type: Sequelize.DATE, allowNull: true },
    });

    await queryInterface.addConstraint("client", {
      fields: ["company_id"],
      type: "foreign key",
      name: "fk_client_company_id",
      references: { table: "company", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    await queryInterface.addConstraint("client", {
      fields: ["business_unit_id"],
      type: "foreign key",
      name: "fk_client_business_unit_id",
      references: { table: "business_unit", field: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    await queryInterface.addIndex("client", { fields: ["company_id"] });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("client");
  },
};

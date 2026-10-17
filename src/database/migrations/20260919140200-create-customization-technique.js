"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("customization_technique", {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
      company_id: { type: Sequelize.BIGINT, allowNull: false },
      name: { type: Sequelize.STRING(255), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      // Costo adicional que suma esta técnica sobre el precio base del
      // producto: fijo (soles) o porcentual (0-100) — ver quotation_item.
      extra_type: { type: Sequelize.ENUM("fixed", "percentage"), allowNull: false, defaultValue: "fixed" },
      extra_value: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      is_deleted: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_by: { type: Sequelize.BIGINT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      updated_by: { type: Sequelize.BIGINT, allowNull: true },
      updated_at: { type: Sequelize.DATE, allowNull: true },
    });

    await queryInterface.addConstraint("customization_technique", {
      fields: ["company_id"],
      type: "foreign key",
      name: "fk_customization_technique_company_id",
      references: { table: "company", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    await queryInterface.addIndex("customization_technique", { fields: ["company_id"] });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("customization_technique");
  },
};

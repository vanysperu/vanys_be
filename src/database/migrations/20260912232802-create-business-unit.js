"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("business_unit", {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
      business_code: { type: Sequelize.STRING(255), allowNull: false },
      url_logo: { type: Sequelize.TEXT, allowNull: false },
      primary_color: { type: Sequelize.STRING(7), allowNull: false },
      secondary_color: { type: Sequelize.STRING(7), allowNull: false },
      company_id: { type: Sequelize.BIGINT, allowNull: false },
      is_deleted: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_date: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      created_by: { type: Sequelize.BIGINT, allowNull: true },
      updated_date: { type: Sequelize.DATE, allowNull: true },
      updated_by: { type: Sequelize.BIGINT, allowNull: true },
    });

    await queryInterface.addConstraint("business_unit", {
      fields: ["company_id"],
      type: "foreign key",
      name: "fk_business_unit_company_id",
      references: { table: "company", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("business_unit");
  },
};

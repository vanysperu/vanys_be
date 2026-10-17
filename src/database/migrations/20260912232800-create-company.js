"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("company", {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
      tenant_id: { type: Sequelize.BIGINT, allowNull: true },
      ruc: { type: Sequelize.STRING(11), allowNull: false, unique: true },
      business_name: { type: Sequelize.STRING(255), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      address: { type: Sequelize.STRING(255), allowNull: true },
      phone: { type: Sequelize.STRING(30), allowNull: true },
      email: { type: Sequelize.STRING(150), allowNull: true },
      tagline: { type: Sequelize.STRING(255), allowNull: true },
      logo_url: { type: Sequelize.TEXT, allowNull: true },
      quotation_validity_text: { type: Sequelize.STRING(100), allowNull: true },
      currency_label: { type: Sequelize.STRING(50), allowNull: true },
      delivery_terms: { type: Sequelize.TEXT, allowNull: true },
      advance_note: { type: Sequelize.TEXT, allowNull: true },
      legal_terms_caption: { type: Sequelize.TEXT, allowNull: true },
      legal_terms_qr_text: { type: Sequelize.STRING(255), allowNull: true },
      terms_qr_url: { type: Sequelize.TEXT, allowNull: true },
      bank_name: { type: Sequelize.STRING(100), allowNull: true },
      bank_account_number: { type: Sequelize.STRING(50), allowNull: true },
      bank_account_holder: { type: Sequelize.STRING(255), allowNull: true },
      bcp_logo_url: { type: Sequelize.TEXT, allowNull: true },
      yape_number: { type: Sequelize.STRING(30), allowNull: true },
      yape_logo_url: { type: Sequelize.TEXT, allowNull: true },
      footer_line_1: { type: Sequelize.STRING(255), allowNull: true },
      footer_line_2: { type: Sequelize.STRING(255), allowNull: true },
      is_deleted: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_date: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      created_by: { type: Sequelize.BIGINT, allowNull: true },
      updated_date: { type: Sequelize.DATE, allowNull: true },
      updated_by: { type: Sequelize.BIGINT, allowNull: true },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("company");
  },
};

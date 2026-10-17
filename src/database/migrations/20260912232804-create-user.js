"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("user", {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.TEXT, allowNull: false },
      paternal_lastname: { type: Sequelize.TEXT, allowNull: false },
      maternal_lastname: { type: Sequelize.TEXT, allowNull: true },
      date_of_birth: { type: Sequelize.STRING, allowNull: true },
      phone_number: { type: Sequelize.STRING, allowNull: true },
      direction: { type: Sequelize.STRING, allowNull: true },
      username: { type: Sequelize.STRING(100), allowNull: true, unique: true },
      email: { type: Sequelize.STRING(255), allowNull: false, unique: true },
      password: { type: Sequelize.STRING, allowNull: false },
      document_type: { type: Sequelize.STRING, allowNull: true },
      document_number: { type: Sequelize.STRING, allowNull: true },
      salt: { type: Sequelize.STRING, allowNull: false },
      status: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      gender: { type: Sequelize.INTEGER, allowNull: false },
      login_status: { type: Sequelize.STRING(10), allowNull: false, defaultValue: "H" },
      failed_attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      last_lock_date: { type: Sequelize.DATE, allowNull: true },
      last_unlock_date: { type: Sequelize.DATE, allowNull: true },
      lockout_minutes: { type: Sequelize.INTEGER, allowNull: true },
      device_id: { type: Sequelize.TEXT, allowNull: true },
      recovery_code: { type: Sequelize.STRING(50), allowNull: true },
      tenant: { type: Sequelize.BIGINT, allowNull: true },
      is_deleted: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_by: { type: Sequelize.INTEGER, allowNull: true },
      created_date: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      updated_by: { type: Sequelize.INTEGER, allowNull: true },
      updated_date: { type: Sequelize.DATE, allowNull: true },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("user");
  },
};

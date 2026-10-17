"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("token", {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
      user_id: { type: Sequelize.BIGINT, allowNull: false },
      uuid: { type: Sequelize.STRING(100), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      expires_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("(CURRENT_TIMESTAMP + INTERVAL 4 HOUR)") },
      last_request_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      status: { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: true },
    });

    await queryInterface.addConstraint("token", {
      fields: ["user_id"],
      type: "foreign key",
      name: "fk_token_user_id",
      references: { table: "user", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("token");
  },
};

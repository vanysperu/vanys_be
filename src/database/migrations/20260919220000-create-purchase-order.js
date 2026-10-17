"use strict";

// Orden de compra: alguien (assigned_to) queda encargado de comprar uno o
// más productos de UNA cotización — pedido explícito del usuario (Inicio:
// "esa persona tiene que comprar tal producto de tal cotización"). Flujo de
// 2 estados nada más (pending -> purchased), sin nivel de "en proceso" ni
// "recibido" por ahora — decisión explícita, mantenerlo simple.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("purchase_order", {
      id: { type: Sequelize.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: "company", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      quotation_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: "quotation", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      assigned_to: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: "user", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      status: { type: Sequelize.ENUM("pending", "purchased"), allowNull: false, defaultValue: "pending" },
      notes: { type: Sequelize.TEXT, allowNull: true },
      purchased_at: { type: Sequelize.DATE, allowNull: true },
      created_by: { type: Sequelize.BIGINT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_by: { type: Sequelize.BIGINT, allowNull: true },
      updated_at: { type: Sequelize.DATE, allowNull: true },
    });

    await queryInterface.addIndex("purchase_order", ["assigned_to", "status"]);
    await queryInterface.addIndex("purchase_order", ["quotation_id"]);

    await queryInterface.createTable("purchase_order_item", {
      id: { type: Sequelize.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      purchase_order_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: "purchase_order", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      quotation_item_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: "quotation_item", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      quantity: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      created_by: { type: Sequelize.BIGINT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_by: { type: Sequelize.BIGINT, allowNull: true },
      updated_at: { type: Sequelize.DATE, allowNull: true },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("purchase_order_item");
    await queryInterface.dropTable("purchase_order");
  },
};

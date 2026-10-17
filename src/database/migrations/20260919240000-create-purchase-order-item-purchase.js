"use strict";

// Un producto de una orden de compra puede conseguirse en varias compras
// distintas (ej. 500 lapiceros: 100 en una tienda, 200 en otra, 200 en
// otra) — cada compra registrada acá guarda cuánto se compró y cuánto
// costó, y automáticamente genera un gasto de la cotización (toda compra
// es un gasto). El item pasa a "purchased" solo cuando la suma de sus
// compras alcanza la cantidad pedida (ver purchase_order_item.service.ts).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("purchase_order_item_purchase", {
      id: { type: Sequelize.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      purchase_order_item_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: "purchase_order_item", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      quotation_expense_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: "quotation_expense", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      quantity: { type: Sequelize.INTEGER, allowNull: false },
      amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      created_by: { type: Sequelize.BIGINT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_by: { type: Sequelize.BIGINT, allowNull: true },
      updated_at: { type: Sequelize.DATE, allowNull: true },
    });

    await queryInterface.addIndex("purchase_order_item_purchase", ["purchase_order_item_id"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("purchase_order_item_purchase");
  },
};

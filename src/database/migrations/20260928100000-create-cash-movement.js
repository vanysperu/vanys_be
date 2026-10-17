"use strict";

// Módulo "Caja" (gestor de pagos): registro manual de dinero que entra o
// sale SIN pasar por una cotización/orden de compra (ej. pagar el alquiler,
// un aporte de capital) — pedido explícito del usuario. Los movimientos que
// SÍ vienen de una cotización (pagos) o de una compra de orden (que ya
// genera un gasto, ver purchase_order_item_purchase.service.ts) se siguen
// registrando en sus propias tablas; este módulo los junta en un solo
// listado consolidado (ver cash_movement/services/find), no los duplica.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("cash_movement", {
      id: { type: Sequelize.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: Sequelize.BIGINT, allowNull: false },
      business_unit_id: { type: Sequelize.BIGINT, allowNull: true },
      direction: { type: Sequelize.ENUM("income", "expense"), allowNull: false },
      // prefix_id de general_variable (categoría "cash_movement_type") —
      // mismo criterio que quotation_payment.method/quotation_expense.category.
      category: { type: Sequelize.STRING(50), allowNull: false },
      amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      description: { type: Sequelize.STRING(500), allowNull: true },
      occurred_at: { type: Sequelize.DATEONLY, allowNull: false },
      quotation_id: { type: Sequelize.BIGINT, allowNull: true },
      purchase_order_id: { type: Sequelize.BIGINT, allowNull: true },
      is_deleted: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_by: { type: Sequelize.BIGINT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_by: { type: Sequelize.BIGINT, allowNull: true },
      updated_at: { type: Sequelize.DATE, allowNull: true },
    });

    await queryInterface.addConstraint("cash_movement", {
      fields: ["company_id"],
      type: "foreign key",
      name: "fk_cash_movement_company_id",
      references: { table: "company", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    await queryInterface.addConstraint("cash_movement", {
      fields: ["business_unit_id"],
      type: "foreign key",
      name: "fk_cash_movement_business_unit_id",
      references: { table: "business_unit", field: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    await queryInterface.addConstraint("cash_movement", {
      fields: ["quotation_id"],
      type: "foreign key",
      name: "fk_cash_movement_quotation_id",
      references: { table: "quotation", field: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    await queryInterface.addConstraint("cash_movement", {
      fields: ["purchase_order_id"],
      type: "foreign key",
      name: "fk_cash_movement_purchase_order_id",
      references: { table: "purchase_order", field: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });

    await queryInterface.addIndex("cash_movement", { fields: ["company_id", "occurred_at"], name: "cash_movement_company_occurred_idx" });
    await queryInterface.addIndex("cash_movement", { fields: ["business_unit_id"], name: "cash_movement_business_unit_idx" });
    await queryInterface.addIndex("cash_movement", { fields: ["created_at"], name: "cash_movement_created_at_idx" });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("cash_movement");
  },
};

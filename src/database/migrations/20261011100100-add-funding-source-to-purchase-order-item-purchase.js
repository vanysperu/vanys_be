"use strict";

// Origen de fondos de una compra real (pedido explícito del usuario): si se
// pagó con plata de la empresa, flujo normal (nada cambia). Si se pagó con
// plata propia del trabajador, se registra quién puso el dinero
// (paid_by_user_id) para poder generar la deuda correspondiente en
// employee_debt (ver 20261011100200-create-employee-debt.js).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("purchase_order_item_purchase", "funding_source", {
      type: Sequelize.ENUM("company", "employee"),
      allowNull: false,
      defaultValue: "company",
    });

    await queryInterface.addColumn("purchase_order_item_purchase", "paid_by_user_id", {
      type: Sequelize.BIGINT,
      allowNull: true,
    });

    await queryInterface.addConstraint("purchase_order_item_purchase", {
      fields: ["paid_by_user_id"],
      type: "foreign key",
      name: "fk_purchase_order_item_purchase_paid_by_user_id",
      references: { table: "user", field: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint(
      "purchase_order_item_purchase",
      "fk_purchase_order_item_purchase_paid_by_user_id"
    );
    await queryInterface.removeColumn("purchase_order_item_purchase", "paid_by_user_id");
    await queryInterface.removeColumn("purchase_order_item_purchase", "funding_source");
  },
};

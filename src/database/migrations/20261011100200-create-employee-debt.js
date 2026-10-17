"use strict";

// Deuda de la empresa hacia un trabajador que pagó una compra de su propio
// bolsillo (purchase_order_item_purchase.funding_source = "employee"). Una
// fila por compra (unique en purchase_order_item_purchase_id) — así nunca
// se duplica la deuda si alguien reintenta la operación. company_id vive
// acá directo (no solo derivado via la compra) para poder listar/filtrar
// "a quién se le debe" sin un join de 3 tablas en cada consulta.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("employee_debt", {
      id: { type: Sequelize.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: Sequelize.BIGINT, allowNull: false },
      user_id: { type: Sequelize.BIGINT, allowNull: false },
      purchase_order_item_purchase_id: { type: Sequelize.BIGINT, allowNull: false, unique: true },
      amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      status: { type: Sequelize.ENUM("pending", "paid"), allowNull: false, defaultValue: "pending" },
      paid_at: { type: Sequelize.DATEONLY, allowNull: true },
      created_by: { type: Sequelize.BIGINT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_by: { type: Sequelize.BIGINT, allowNull: true },
      updated_at: { type: Sequelize.DATE, allowNull: true },
    });

    await queryInterface.addConstraint("employee_debt", {
      fields: ["company_id"],
      type: "foreign key",
      name: "fk_employee_debt_company_id",
      references: { table: "company", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    await queryInterface.addConstraint("employee_debt", {
      fields: ["user_id"],
      type: "foreign key",
      name: "fk_employee_debt_user_id",
      references: { table: "user", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    await queryInterface.addConstraint("employee_debt", {
      fields: ["purchase_order_item_purchase_id"],
      type: "foreign key",
      name: "fk_employee_debt_purchase_id",
      references: { table: "purchase_order_item_purchase", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    await queryInterface.addIndex("employee_debt", { fields: ["company_id", "user_id", "status"] });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("employee_debt");
  },
};

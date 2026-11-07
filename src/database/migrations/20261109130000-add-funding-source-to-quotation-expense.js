"use strict";

const { columnExists, constraintExists, indexExists } = require("../migration-helpers");

const DEBT_EXPENSE_COLUMN = "quotation_expense_id";
const DEBT_EXPENSE_INDEX = "uq_employee_debt_quotation_expense";
const DEBT_EXPENSE_FK = "fk_employee_debt_quotation_expense_id";

// Pedido explícito del usuario: al añadir un gasto a una cotización, indicar si
// la plata fue de la empresa o de un trabajador al que hay que pagarle.
//   - quotation_expense.funding_source: quién puso la plata de un gasto manual.
//     Nace en "company": los gastos de hoy siguen siendo de la empresa. En una
//     compra manda purchase_order_item_purchase.funding_source.
//   - employee_debt: origen "expense", enlazada a su gasto. La deuda se repone
//     igual que la de una compra y hasta entonces no sale de Caja.
module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await columnExists(queryInterface, "quotation_expense", "funding_source"))) {
      await queryInterface.addColumn("quotation_expense", "funding_source", {
        type: Sequelize.ENUM("company", "employee"),
        allowNull: false,
        defaultValue: "company",
      });
    }

    // MODIFY directo: agregar un valor al final no toca las filas existentes.
    await queryInterface.sequelize.query(
      "ALTER TABLE employee_debt MODIFY COLUMN origin ENUM('purchase','manual','expense') NOT NULL DEFAULT 'purchase'"
    );

    if (!(await columnExists(queryInterface, "employee_debt", DEBT_EXPENSE_COLUMN))) {
      await queryInterface.addColumn("employee_debt", DEBT_EXPENSE_COLUMN, { type: Sequelize.BIGINT, allowNull: true });
    }
    // Un gasto, a lo sumo una deuda (igual que una compra).
    if (!(await indexExists(queryInterface, "employee_debt", DEBT_EXPENSE_INDEX))) {
      await queryInterface.addIndex("employee_debt", { fields: [DEBT_EXPENSE_COLUMN], unique: true, name: DEBT_EXPENSE_INDEX });
    }
    if (!(await constraintExists(queryInterface, "employee_debt", DEBT_EXPENSE_FK))) {
      await queryInterface.addConstraint("employee_debt", {
        fields: [DEBT_EXPENSE_COLUMN],
        type: "foreign key",
        name: DEBT_EXPENSE_FK,
        references: { table: "quotation_expense", field: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });
    }
  },

  async down(queryInterface) {
    if (await constraintExists(queryInterface, "employee_debt", DEBT_EXPENSE_FK)) {
      await queryInterface.removeConstraint("employee_debt", DEBT_EXPENSE_FK);
    }
    if (await indexExists(queryInterface, "employee_debt", DEBT_EXPENSE_INDEX)) {
      await queryInterface.removeIndex("employee_debt", DEBT_EXPENSE_INDEX);
    }
    if (await columnExists(queryInterface, "employee_debt", DEBT_EXPENSE_COLUMN)) {
      await queryInterface.removeColumn("employee_debt", DEBT_EXPENSE_COLUMN);
    }
    await queryInterface.sequelize.query("UPDATE employee_debt SET origin = 'manual' WHERE origin = 'expense'");
    await queryInterface.sequelize.query(
      "ALTER TABLE employee_debt MODIFY COLUMN origin ENUM('purchase','manual') NOT NULL DEFAULT 'purchase'"
    );
    if (await columnExists(queryInterface, "quotation_expense", "funding_source")) {
      await queryInterface.removeColumn("quotation_expense", "funding_source");
    }
  },
};

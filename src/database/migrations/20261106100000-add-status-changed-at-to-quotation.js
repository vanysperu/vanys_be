"use strict";

const { columnExists, indexExists } = require("../migration-helpers");

const INDEX_NAME = "idx_quotation_company_status_changed";

// Cuándo llegó la cotización a su estado actual. Pedido explícito del usuario:
// "cuando paso una cotización del carrito a Pendiente no se lista". El tablero
// ordenaba por fecha de creación: una cotización recién pasada a Pendiente
// quedaba al fondo de su columna, o fuera de las que cargaba la pantalla. Con
// esta columna cada columna del tablero muestra arriba lo último que llegó.
module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await columnExists(queryInterface, "quotation", "status_changed_at"))) {
      await queryInterface.addColumn("quotation", "status_changed_at", { type: Sequelize.DATE, allowNull: true });
      // Las que ya existen: su último cambio de estado del Historial o, si
      // nunca cambió, su creación.
      await queryInterface.sequelize.query(`
        UPDATE quotation q
        SET q.status_changed_at = COALESCE(
          (SELECT MAX(e.created_at) FROM quotation_event e
           WHERE e.quotation_id = q.id AND e.action = 'status_changed'),
          q.created_at
        )`);
      await queryInterface.changeColumn("quotation", "status_changed_at", {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      });
    }

    // Cada columna del tablero: empresa + estado, del cambio más reciente al
    // más antiguo.
    if (!(await indexExists(queryInterface, "quotation", INDEX_NAME))) {
      await queryInterface.addIndex("quotation", {
        fields: ["company_id", "status", "status_changed_at"],
        name: INDEX_NAME,
      });
    }
  },

  async down(queryInterface) {
    if (await indexExists(queryInterface, "quotation", INDEX_NAME)) {
      await queryInterface.removeIndex("quotation", INDEX_NAME);
    }
    if (await columnExists(queryInterface, "quotation", "status_changed_at")) {
      await queryInterface.removeColumn("quotation", "status_changed_at");
    }
  },
};

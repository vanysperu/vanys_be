"use strict";

const { columnExists, indexExists } = require("../migration-helpers");

// Sprint 2 (pedido del usuario, 14-nov): un producto de la cotización que el
// cliente NO aceptó se marca como "no aceptado" sin editar la cotización. El
// equipo lo sigue viendo (con su historial); el cliente no (PDF y enlace
// público), y no suma al total. Se puede reactivar si el cliente lo pide.
module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    if (!(await columnExists(queryInterface, "quotation_item", "is_excluded"))) {
      await sequelize.query(
        `ALTER TABLE quotation_item
         ADD COLUMN is_excluded BOOLEAN NOT NULL DEFAULT FALSE AFTER subtotal,
         ADD COLUMN excluded_at DATETIME NULL AFTER is_excluded,
         ADD COLUMN excluded_by BIGINT NULL AFTER excluded_at`
      );
    }
    if (!(await indexExists(queryInterface, "quotation_item", "idx_quotation_item_excluded"))) {
      await queryInterface.addIndex("quotation_item", { fields: ["quotation_id", "is_excluded"], name: "idx_quotation_item_excluded" });
    }
  },

  async down(queryInterface) {
    if (await indexExists(queryInterface, "quotation_item", "idx_quotation_item_excluded")) {
      await queryInterface.removeIndex("quotation_item", "idx_quotation_item_excluded");
    }
    if (await columnExists(queryInterface, "quotation_item", "is_excluded")) {
      await queryInterface.sequelize.query(
        "ALTER TABLE quotation_item DROP COLUMN excluded_by, DROP COLUMN excluded_at, DROP COLUMN is_excluded"
      );
    }
  },
};

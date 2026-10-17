"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("quotation_item", {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
      quotation_id: { type: Sequelize.BIGINT, allowNull: false },
      product_id: { type: Sequelize.BIGINT, allowNull: false },
      technique_id: { type: Sequelize.BIGINT, allowNull: true },
      quantity: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      // Snapshot del precio al momento de agregar el item (product.base_price
      // + el extra de la técnica elegida) — si el catálogo cambia después,
      // la cotización ya emitida no se ve afectada.
      unit_price: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      subtotal: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      created_by: { type: Sequelize.BIGINT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      updated_by: { type: Sequelize.BIGINT, allowNull: true },
      updated_at: { type: Sequelize.DATE, allowNull: true },
    });

    await queryInterface.addConstraint("quotation_item", {
      fields: ["quotation_id"],
      type: "foreign key",
      name: "fk_quotation_item_quotation_id",
      references: { table: "quotation", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    await queryInterface.addConstraint("quotation_item", {
      fields: ["product_id"],
      type: "foreign key",
      name: "fk_quotation_item_product_id",
      references: { table: "product", field: "id" },
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
    await queryInterface.addConstraint("quotation_item", {
      fields: ["technique_id"],
      type: "foreign key",
      name: "fk_quotation_item_technique_id",
      references: { table: "customization_technique", field: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    await queryInterface.addIndex("quotation_item", { fields: ["quotation_id"] });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("quotation_item");
  },
};

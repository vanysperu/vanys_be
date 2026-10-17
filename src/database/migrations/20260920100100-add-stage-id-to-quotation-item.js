"use strict";

// Etapa de producción actual de cada item de la cotización.
//
// Originalmente la FK apuntaba a la tabla `production_stage`; esa tabla se
// reemplazó por filas de general_variable (category="production_stage") y la
// FK se re-apuntó en 20260919180000-drop-production-stage-table. Como esa
// migración tiene fecha anterior a esta (aunque se aplicó después), en una
// instalación desde cero esta corre última: crea la columna directamente con
// la FK definitiva hacia general_variable, con el mismo nombre que tiene en
// las bases existentes. Las bases que ya la aplicaron no la vuelven a correr.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("quotation_item", "stage_id", {
      type: Sequelize.BIGINT,
      allowNull: true,
    });

    // ON DELETE SET NULL: si alguien borra la etapa desde "Variables
    // Generales", el item queda sin etapa en vez de romper la cotización.
    await queryInterface.addConstraint("quotation_item", {
      fields: ["stage_id"],
      type: "foreign key",
      name: "fk_quotation_item_stage_id_general_variable",
      references: { table: "general_variable", field: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint("quotation_item", "fk_quotation_item_stage_id_general_variable");
    await queryInterface.removeColumn("quotation_item", "stage_id");
  },
};

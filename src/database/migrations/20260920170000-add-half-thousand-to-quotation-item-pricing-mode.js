"use strict";

// MySQL no tiene un ALTER directo para agregar un valor a un ENUM sin
// redefinirlo completo — se reconstruye la columna con el nuevo set de
// valores, sin tocar los datos existentes (ninguno usaba "half_thousand"
// todavía, así que no hay filas que migrar).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("quotation_item", "pricing_mode", {
      type: Sequelize.ENUM("unit", "hundred", "half_thousand", "thousand", "custom"),
      allowNull: false,
      defaultValue: "unit",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("quotation_item", "pricing_mode", {
      type: Sequelize.ENUM("unit", "hundred", "thousand", "custom"),
      allowNull: false,
      defaultValue: "unit",
    });
  },
};

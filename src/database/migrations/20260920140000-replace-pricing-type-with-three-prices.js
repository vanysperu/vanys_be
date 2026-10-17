"use strict";

// Rediseño: un producto se registra UNA vez con hasta 3 precios de catálogo
// (unidad/ciento/millar) en simultáneo, no un producto por cada modalidad.
// "base_price" (ex precio único) pasa a ser "price_unit" para no perder los
// datos ya cargados; "pricing_type" desaparece porque ahora el modo de
// precio se elige POR ITEM al armar la cotización, no en el producto.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.renameColumn("product", "base_price", "price_unit");
    await queryInterface.changeColumn("product", "price_unit", {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });
    await queryInterface.addColumn("product", "price_hundred", {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });
    await queryInterface.addColumn("product", "price_thousand", {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });

    // Los productos que ya tenían pricing_type="hundred"/"thousand"
    // guardaban el precio del lote en base_price (ahora price_unit) — se
    // migra al campo correcto para no perder el dato ni cambiar su precio.
    await queryInterface.sequelize.query(
      `UPDATE product SET price_hundred = price_unit, price_unit = NULL WHERE pricing_type = 'hundred'`
    );
    await queryInterface.sequelize.query(
      `UPDATE product SET price_thousand = price_unit, price_unit = NULL WHERE pricing_type = 'thousand'`
    );

    await queryInterface.removeColumn("product", "pricing_type");
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn("product", "pricing_type", {
      type: Sequelize.ENUM("unit", "hundred", "thousand"),
      allowNull: false,
      defaultValue: "unit",
    });
    await queryInterface.sequelize.query(
      `UPDATE product SET pricing_type = 'hundred', price_unit = price_hundred WHERE price_hundred IS NOT NULL AND price_unit IS NULL`
    );
    await queryInterface.sequelize.query(
      `UPDATE product SET pricing_type = 'thousand', price_unit = price_thousand WHERE price_thousand IS NOT NULL AND price_unit IS NULL`
    );
    await queryInterface.removeColumn("product", "price_hundred");
    await queryInterface.removeColumn("product", "price_thousand");
    await queryInterface.changeColumn("product", "price_unit", {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.renameColumn("product", "price_unit", "base_price");
  },
};

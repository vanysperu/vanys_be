"use strict";

const { tableExists } = require("../migration-helpers");

// Anuncios de la web (pedido explícito del usuario): imágenes publicitarias que
// la web de cada empresa lista con su API key. Cada anuncio va en una ZONA
// (lugar de la web: banner de inicio, lateral...) y tiene su orden dentro de
// ella; la web pide solo los de una zona. Se apagan y prenden (`is_active`) y
// se ELIMINAN de verdad junto con su imagen: "el eliminado es total, no
// conservamos ninguna foto que se elimine". Es la excepción a la regla de
// soft-delete, documentada en advertisement/README.md.
module.exports = {
  async up(queryInterface, Sequelize) {
    if (await tableExists(queryInterface, "advertisement")) return;

    await queryInterface.createTable("advertisement", {
      id: { type: Sequelize.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: Sequelize.BIGINT, allowNull: false },
      // Zona = fila de Variables Generales (category "advertisement_zone"): su
      // código es lo que manda la web. Sin zona, sale solo si la web no filtra.
      zone_id: { type: Sequelize.BIGINT, allowNull: true },
      // Nombre interno; la web lo puede usar como texto alternativo.
      title: { type: Sequelize.STRING(120), allowNull: false },
      // A dónde lleva el anuncio al hacer clic en la web (opcional).
      link_url: { type: Sequelize.STRING(500), allowNull: true },
      // Imagen subida al sistema (company_asset de la misma empresa).
      image_path: { type: Sequelize.STRING(255), allowNull: false },
      // Orden dentro de su zona: 1, 2, 3... sin huecos.
      position: { type: Sequelize.INTEGER, allowNull: false },
      // Apagado = no sale en la web, pero se conserva con su imagen.
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_by: { type: Sequelize.BIGINT, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_by: { type: Sequelize.BIGINT, allowNull: true },
      updated_at: { type: Sequelize.DATE, allowNull: true },
    });

    await queryInterface.addConstraint("advertisement", {
      fields: ["company_id"],
      type: "foreign key",
      name: "fk_advertisement_company_id",
      references: { table: "company", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    // Si la zona se borra de Variables Generales, el anuncio queda sin zona
    // (no se pierde).
    await queryInterface.addConstraint("advertisement", {
      fields: ["zone_id"],
      type: "foreign key",
      name: "fk_advertisement_zone_id",
      references: { table: "general_variable", field: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });

    // El panel lista por empresa, zona y orden; la web, solo los prendidos.
    await queryInterface.addIndex("advertisement", {
      fields: ["company_id", "zone_id", "position"],
      name: "idx_advertisement_company_zone_position",
    });
    await queryInterface.addIndex("advertisement", {
      fields: ["company_id", "is_active", "zone_id", "position"],
      name: "idx_advertisement_company_active",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("advertisement");
  },
};

"use strict";

// Las etapas de producción pasan a modelarse como filas de general_variable
// (category="production_stage", ver seeder 20260919180100) en vez de una
// tabla propia — así una empresa las administra desde la pantalla existente
// de "Variables Generales" en vez de necesitar un módulo/pantalla nuevos
// (pedido explícito del usuario: "eso se crea en variables generales").
//
// ORDEN: esta migración tiene fecha ANTERIOR a las que crean
// production_stage y quotation_item.stage_id (20260920100000 y
// 20260920100100), pero en la práctica se escribió y aplicó DESPUÉS de ellas
// (esas dos se crearon con fecha adelantada). En una instalación desde cero
// corre primero, cuando ni la tabla ni la columna existen: no hay nada que
// migrar y no hace nada — 20260920100100 crea la columna ya apuntando a
// general_variable. Antes fallaba ("Key column 'stage_id' doesn't exist") y
// era imposible crear una base nueva con `db:migrate`.
//
// Todas las consultas a information_schema filtran por TABLE_SCHEMA =
// DATABASE(): sin eso, en un servidor MySQL con varias bases tomaba
// restricciones de OTRA base con una tabla quotation_item.
const { columnExists, constraintExists, tableExists } = require("../migration-helpers");

module.exports = {
  async up(queryInterface) {
    // 1) Se suelta la FK de quotation_item.stage_id -> production_stage
    //    antes de poder borrar la tabla referenciada (el nombre de la
    //    constraint se busca en vez de asumirlo fijo).
    const [constraints] = await queryInterface.sequelize.query(
      `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'quotation_item' AND COLUMN_NAME = 'stage_id'
       AND REFERENCED_TABLE_NAME = 'production_stage'`
    );
    for (const row of constraints) {
      await queryInterface.removeConstraint("quotation_item", row.CONSTRAINT_NAME);
    }

    if (await tableExists(queryInterface, "production_stage")) {
      await queryInterface.dropTable("production_stage");
    }

    // 2) stage_id ahora referencia general_variable.id (la etapa vive ahí
    //    como category="production_stage") — ON DELETE SET NULL: si alguien
    //    borra esa fila desde "Variables Generales", el item simplemente
    //    queda sin etapa en vez de romper la fila de la cotización.
    if (!(await columnExists(queryInterface, "quotation_item", "stage_id"))) return;
    if (await constraintExists(queryInterface, "quotation_item", "fk_quotation_item_stage_id_general_variable")) return;

    await queryInterface.addConstraint("quotation_item", {
      fields: ["stage_id"],
      type: "foreign key",
      name: "fk_quotation_item_stage_id_general_variable",
      references: { table: "general_variable", field: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint("quotation_item", "fk_quotation_item_stage_id_general_variable");

    await queryInterface.createTable("production_stage", {
      id: { type: Sequelize.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: "company", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      name: { type: Sequelize.STRING(100), allowNull: false },
      color: { type: Sequelize.STRING(7), allowNull: false, defaultValue: "#5B47F5" },
      position: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      is_deleted: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_by: { type: Sequelize.BIGINT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_by: { type: Sequelize.BIGINT, allowNull: true },
      updated_at: { type: Sequelize.DATE, allowNull: true },
    });
    await queryInterface.addIndex("production_stage", ["company_id", "position"]);
  },
};

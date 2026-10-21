"use strict";

// Utilidades para migraciones que deben poder correr tanto sobre una base
// existente como sobre una instalación desde cero (ver
// 20260919140500-create-quotation-flow-tables-early.js).
//
// Vive FUERA de migrations/ a propósito: sequelize-cli trata cada .js de esa
// carpeta como una migración.
//
// Toda consulta a information_schema filtra por TABLE_SCHEMA = DATABASE():
// en un servidor MySQL con varias bases, sin ese filtro se leen tablas y
// restricciones de OTRA base.

const exists = async (queryInterface, sql, replacements) => {
  const [rows] = await queryInterface.sequelize.query(sql, { replacements });
  return rows.length > 0;
};

const tableExists = (queryInterface, table) =>
  exists(
    queryInterface,
    "SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
    [table]
  );

const columnExists = (queryInterface, table, column) =>
  exists(
    queryInterface,
    "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [table, column]
  );

const constraintExists = (queryInterface, table, name) =>
  exists(
    queryInterface,
    "SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?",
    [table, name]
  );

const indexExists = (queryInterface, table, name) =>
  exists(
    queryInterface,
    "SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?",
    [table, name]
  );

module.exports = { tableExists, columnExists, constraintExists, indexExists };

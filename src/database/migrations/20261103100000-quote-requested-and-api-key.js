"use strict";

const { tableExists } = require("../migration-helpers");

// Pedidos de cotización desde la web (pedido explícito del usuario: "que
// desde nuestra web el cliente pueda elegir los productos y nosotros vemos
// la cotización, terminamos de llevarla y la pasamos a Pendiente").
//
// 1. Estado nuevo `quote_requested` ("Pendiente de cotizar"): la cotización
//    llega desde la web con los productos que eligió el cliente, todavía sin
//    técnica ni precio final. Va PRIMERO en el ENUM porque es el inicio del
//    flujo (antes de "pending").
//
// 2. Tabla `api_key`: la web no usa sesión (el token vence), así que se
//    autentica con una API key por empresa en la cabecera X-Api-Key. Nunca
//    se guarda la key en texto plano: solo su SHA-256 (`key_hash`) y un
//    prefijo corto para reconocerla en listados (`key_prefix`). Con la key
//    se derivan la empresa (y opcionalmente la tienda) del pedido: nunca se
//    confía en un company_id que mande la web (CLAUDE.md sección 10).
const STATUSES_BEFORE = [
  "pending",
  "accepted",
  "rejected",
  "expired",
  "design_pending",
  "in_process",
  "cancelled",
  "ready",
  "delivered",
  "finished",
];
const STATUSES_AFTER = ["quote_requested", ...STATUSES_BEFORE];

const enumSql = (values) => values.map((value) => `'${value}'`).join(", ");

module.exports = {
  async up(queryInterface, Sequelize) {
    // MODIFY con la lista completa: repetirlo no cambia nada (idempotente).
    await queryInterface.sequelize.query(
      `ALTER TABLE quotation MODIFY status ENUM(${enumSql(STATUSES_AFTER)}) NOT NULL DEFAULT 'pending'`
    );

    if (await tableExists(queryInterface, "api_key")) return;

    await queryInterface.createTable("api_key", {
      id: { type: Sequelize.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: Sequelize.BIGINT, allowNull: false },
      // Tienda opcional: si está, las cotizaciones de la web caen en esa
      // tienda; si no, quedan a nivel empresa (sin tienda).
      business_unit_id: { type: Sequelize.BIGINT, allowNull: true },
      name: { type: Sequelize.STRING(100), allowNull: false },
      key_prefix: { type: Sequelize.STRING(16), allowNull: false },
      key_hash: { type: Sequelize.CHAR(64), allowNull: false },
      last_used_at: { type: Sequelize.DATE, allowNull: true },
      // Revocada (soft-delete): la key deja de funcionar al instante.
      is_deleted: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_by: { type: Sequelize.BIGINT, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_by: { type: Sequelize.BIGINT, allowNull: true },
      updated_at: { type: Sequelize.DATE, allowNull: true },
    });

    await queryInterface.addConstraint("api_key", {
      fields: ["company_id"],
      type: "foreign key",
      name: "fk_api_key_company_id",
      references: { table: "company", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    await queryInterface.addConstraint("api_key", {
      fields: ["business_unit_id"],
      type: "foreign key",
      name: "fk_api_key_business_unit_id",
      references: { table: "business_unit", field: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    await queryInterface.addConstraint("api_key", {
      fields: ["created_by"],
      type: "foreign key",
      name: "fk_api_key_created_by",
      references: { table: "user", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    // Cada request de la web busca su key por hash: es la consulta caliente.
    await queryInterface.addIndex("api_key", { fields: ["key_hash"], unique: true, name: "uq_api_key_key_hash" });
    await queryInterface.addIndex("api_key", { fields: ["company_id", "created_at"], name: "idx_api_key_company" });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("api_key");
    // Las cotizaciones que sigan en "Pendiente de cotizar" pasan a Pendiente
    // para que el ENUM viejo las acepte.
    await queryInterface.sequelize.query("UPDATE quotation SET status = 'pending' WHERE status = 'quote_requested'");
    await queryInterface.sequelize.query(
      `ALTER TABLE quotation MODIFY status ENUM(${enumSql(STATUSES_BEFORE)}) NOT NULL DEFAULT 'pending'`
    );
  },
};

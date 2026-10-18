"use strict";

const { tableExists } = require("../migration-helpers");

// Recordatorios (pedido explícito del usuario: "crear notificaciones que
// salgan en el tiempo que yo le coloque para que me recuerde cosas a mí o a
// otro usuario").
//
// - remind_at: instante UTC en que el recordatorio "suena". No hay un job
//   que lo dispare: el frontend pregunta cada minuto cuáles ya vencieron
//   (remind_at <= ahora y sin leer). Así funciona igual en un hosting donde
//   la app se duerme (Hostinger sin VPS): al despertar, lo vencido sigue
//   vencido.
// - recipient_user_id: a quién le llega (uno mismo u otro usuario).
// - read_at: cuándo el destinatario lo marcó como visto (NULL = pendiente).
// - company_id: la del destinatario. NULL solo cuando el destinatario es un
//   usuario de plataforma (Super Administrador, sin empresa).
// - is_deleted: cancelado por quien lo creó (soft-delete, nunca DELETE).
module.exports = {
  async up(queryInterface, Sequelize) {
    if (await tableExists(queryInterface, "reminder")) return;

    await queryInterface.createTable("reminder", {
      id: { type: Sequelize.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: Sequelize.BIGINT, allowNull: true },
      recipient_user_id: { type: Sequelize.BIGINT, allowNull: false },
      title: { type: Sequelize.STRING(150), allowNull: false },
      message: { type: Sequelize.STRING(500), allowNull: true },
      remind_at: { type: Sequelize.DATE, allowNull: false },
      read_at: { type: Sequelize.DATE, allowNull: true },
      is_deleted: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_by: { type: Sequelize.BIGINT, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_by: { type: Sequelize.BIGINT, allowNull: true },
      updated_at: { type: Sequelize.DATE, allowNull: true },
    });

    await queryInterface.addConstraint("reminder", {
      fields: ["company_id"],
      type: "foreign key",
      name: "fk_reminder_company_id",
      references: { table: "company", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    await queryInterface.addConstraint("reminder", {
      fields: ["recipient_user_id"],
      type: "foreign key",
      name: "fk_reminder_recipient_user_id",
      references: { table: "user", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    await queryInterface.addConstraint("reminder", {
      fields: ["created_by"],
      type: "foreign key",
      name: "fk_reminder_created_by",
      references: { table: "user", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    // "Mis recordatorios vencidos sin leer" se consulta cada minuto: es la
    // consulta más caliente del módulo.
    await queryInterface.addIndex("reminder", {
      fields: ["recipient_user_id", "is_deleted", "read_at", "remind_at"],
      name: "idx_reminder_recipient_due",
    });
    await queryInterface.addIndex("reminder", { fields: ["created_by", "created_at"], name: "idx_reminder_created_by" });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("reminder");
  },
};

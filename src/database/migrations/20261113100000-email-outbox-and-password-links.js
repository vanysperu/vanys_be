"use strict";

const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { columnExists, tableExists } = require("../migration-helpers");

// Sprint 2, ítem 4 (pedido explícito del usuario: "yo no quiero códigos, quiero
// que llegue link para crear contraseña o link para recuperarla al correo").
//
//   email_outbox           cola de correos: todo correo se guarda acá y un job lo
//                          manda con reintentos (en Hostinger la app se apaga sin
//                          tráfico, así que no puede depender de un envío "en vivo").
//                          El contenido (enlaces) va CIFRADO y se borra al enviarse.
//   email_daily_usage      cuántos correos salieron cada día, contra el cupo del
//                          plan (Brevo gratis: 300/día para toda la plataforma), y
//                          cuándo se avisó a los Super Administradores (80 % y 100 %).
//   password_reset_token   enlaces para crear (invitación) o recuperar la
//                          contraseña. Se guarda solo el SHA-256 del token.
//
// Además se cierra el agujero de la recuperación vieja (código de 4 dígitos sin
// vencimiento ni límite, rutas /recovery/*): se elimina user.recovery_code. Y
// los usuarios que todavía tienen la contraseña temporal fija "123456" (nunca la
// cambiaron) quedan con una contraseña inutilizable: entran con el enlace de
// invitación o "¿Olvidaste tu contraseña?".
//
// Tablas de plataforma (como modules/resources): company_id es opcional porque
// hay correos que no son de ninguna empresa (ej. el de un Super Administrador).
const LEGACY_TEMPORARY_PASSWORD = "123456";

const AUDIT_COLUMNS = `
      created_by BIGINT NULL,
      created_at DATETIME NOT NULL,
      updated_by BIGINT NULL,
      updated_at DATETIME NULL`;

const CREATE_EMAIL_OUTBOX = `
    CREATE TABLE email_outbox (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NULL,
      category ENUM('security', 'quotation', 'notification') NOT NULL,
      template VARCHAR(50) NOT NULL,
      to_email VARCHAR(255) NOT NULL,
      cc_email VARCHAR(255) NULL,
      reply_to VARCHAR(255) NULL,
      subject VARCHAR(255) NOT NULL,
      payload_encrypted MEDIUMTEXT NULL,
      status ENUM('pending', 'sending', 'sent', 'failed') NOT NULL DEFAULT 'pending',
      attempts INT NOT NULL DEFAULT 0,
      next_attempt_at DATETIME NULL,
      sent_at DATETIME NULL,
      provider VARCHAR(20) NULL,
      provider_message_id VARCHAR(255) NULL,
      last_error VARCHAR(500) NULL,
      related_type VARCHAR(40) NULL,
      related_id BIGINT NULL,${AUDIT_COLUMNS},
      PRIMARY KEY (id),
      KEY idx_email_outbox_due (status, next_attempt_at),
      KEY idx_email_outbox_company_created (company_id, created_at),
      KEY idx_email_outbox_related (related_type, related_id),
      CONSTRAINT fk_email_outbox_company_id FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE SET NULL ON UPDATE CASCADE
    ) ENGINE=InnoDB`;

const CREATE_EMAIL_DAILY_USAGE = `
    CREATE TABLE email_daily_usage (
      usage_date DATE NOT NULL,
      sent_count INT NOT NULL DEFAULT 0,
      daily_limit INT NOT NULL,
      alert_warning_at DATETIME NULL,
      alert_exhausted_at DATETIME NULL,${AUDIT_COLUMNS},
      PRIMARY KEY (usage_date)
    ) ENGINE=InnoDB`;

const CREATE_PASSWORD_RESET_TOKEN = `
    CREATE TABLE password_reset_token (
      id BIGINT NOT NULL AUTO_INCREMENT,
      user_id BIGINT NOT NULL,
      company_id BIGINT NULL,
      purpose ENUM('reset', 'invite') NOT NULL,
      token_hash CHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      requested_ip VARCHAR(64) NULL,${AUDIT_COLUMNS},
      PRIMARY KEY (id),
      UNIQUE KEY uq_password_reset_token_hash (token_hash),
      KEY idx_password_reset_token_user (user_id, created_at),
      CONSTRAINT fk_password_reset_token_user_id FOREIGN KEY (user_id) REFERENCES \`user\` (id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB`;

// Hash inutilizable: bcrypt de 32 bytes aleatorios que nadie conoce.
const unusablePassword = async () => {
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(crypto.randomBytes(32).toString("base64"), salt);
  return { hash, salt };
};

module.exports = {
  async up(queryInterface) {
    if (!(await tableExists(queryInterface, "email_outbox"))) {
      await queryInterface.sequelize.query(CREATE_EMAIL_OUTBOX);
    }
    if (!(await tableExists(queryInterface, "email_daily_usage"))) {
      await queryInterface.sequelize.query(CREATE_EMAIL_DAILY_USAGE);
    }
    if (!(await tableExists(queryInterface, "password_reset_token"))) {
      await queryInterface.sequelize.query(CREATE_PASSWORD_RESET_TOKEN);
    }

    if (await columnExists(queryInterface, "user", "recovery_code")) {
      await queryInterface.removeColumn("user", "recovery_code");
    }

    // Solo los que siguen con "123456": se comprueba el hash de cada uno (los
    // que ya eligieron su contraseña no se tocan).
    const [pending] = await queryInterface.sequelize.query(
      "SELECT id, password, salt FROM `user` WHERE must_change_password = true AND password IS NOT NULL AND salt IS NOT NULL"
    );
    for (const user of pending) {
      const stillTemporary = (await bcrypt.hash(LEGACY_TEMPORARY_PASSWORD, user.salt)) === user.password;
      if (!stillTemporary) continue;
      const replacement = await unusablePassword();
      await queryInterface.sequelize.query("UPDATE `user` SET password = ?, salt = ? WHERE id = ?", {
        replacements: [replacement.hash, replacement.salt, user.id],
      });
    }
  },

  async down(queryInterface, Sequelize) {
    if (!(await columnExists(queryInterface, "user", "recovery_code"))) {
      await queryInterface.addColumn("user", "recovery_code", { type: Sequelize.STRING(50), allowNull: true });
    }
    await queryInterface.sequelize.query("DROP TABLE IF EXISTS password_reset_token");
    await queryInterface.sequelize.query("DROP TABLE IF EXISTS email_daily_usage");
    await queryInterface.sequelize.query("DROP TABLE IF EXISTS email_outbox");
  },
};

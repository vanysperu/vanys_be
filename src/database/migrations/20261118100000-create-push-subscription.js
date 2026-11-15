"use strict";

const { tableExists } = require("../migration-helpers");

// Notificaciones al teléfono (pedido del usuario, 14-nov-2026): cada teléfono o
// navegador donde un usuario tocó "Activar notificaciones" deja su suscripción
// Web Push (la dirección del servicio de push del navegador y sus claves).
// Una suscripción pertenece a un solo usuario; si otro usuario activa las
// notificaciones en el mismo teléfono, la suscripción pasa a ser suya.
// `active = false` cuando el servicio de push dice que ya no existe (410/404)
// o el usuario las apaga o cierra sesión.
module.exports = {
  async up(queryInterface) {
    if (await tableExists(queryInterface, "push_subscription")) return;
    await queryInterface.sequelize.query(`
      CREATE TABLE push_subscription (
        id BIGINT NOT NULL AUTO_INCREMENT,
        company_id BIGINT NULL,
        user_id BIGINT NOT NULL,
        endpoint VARCHAR(700) NOT NULL,
        endpoint_hash CHAR(64) NOT NULL,
        p256dh VARCHAR(255) NOT NULL,
        auth VARCHAR(255) NOT NULL,
        user_agent VARCHAR(255) NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        last_sent_at DATETIME NULL,
        last_error VARCHAR(255) NULL,
        created_by BIGINT NULL,
        created_at DATETIME NOT NULL,
        updated_by BIGINT NULL,
        updated_at DATETIME NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_push_subscription_endpoint (endpoint_hash),
        KEY idx_push_subscription_user (user_id, active),
        KEY idx_push_subscription_company (company_id, created_at),
        CONSTRAINT fk_push_subscription_user_id FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_push_subscription_company_id FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB`);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query("DROP TABLE IF EXISTS push_subscription");
  },
};

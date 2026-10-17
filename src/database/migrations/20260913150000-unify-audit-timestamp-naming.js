"use strict";

// `company`, `business_unit`, `role` y `user` usaban `created_date`/
// `updated_date`, mientras que `token`, `modules`, `resources` y
// `roles_resources` ya usaban `created_at`/`updated_at` -- que es además la
// convención que CLAUDE.md (sección 3, AUDITORÍA) documenta como estándar.
// Se unifica todo el esquema a `created_at`/`updated_at`. `log` solo tiene
// `created_date` (no tiene updated, nunca se edita un log).
//
// Se usa SQL crudo (CHANGE COLUMN) en vez de queryInterface.renameColumn:
// Sequelize reconstruye el DEFAULT a partir de lo que MySQL devuelve en
// DESCRIBE, y para columnas con DEFAULT CURRENT_TIMESTAMP eso vuelve como el
// string 'CURRENT_TIMESTAMP' (comillado), que MySQL rechaza como default
// inválido para un DATETIME al reconstruir el CHANGE COLUMN.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;

    await q.query("ALTER TABLE `company` CHANGE COLUMN `created_date` `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");
    await q.query("ALTER TABLE `company` CHANGE COLUMN `updated_date` `updated_at` DATETIME NULL");

    await q.query("ALTER TABLE `business_unit` CHANGE COLUMN `created_date` `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");
    await q.query("ALTER TABLE `business_unit` CHANGE COLUMN `updated_date` `updated_at` DATETIME NULL");

    await q.query("ALTER TABLE `role` CHANGE COLUMN `created_date` `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");
    await q.query("ALTER TABLE `role` CHANGE COLUMN `updated_date` `updated_at` DATETIME NULL");

    await q.query("ALTER TABLE `user` CHANGE COLUMN `created_date` `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");
    await q.query("ALTER TABLE `user` CHANGE COLUMN `updated_date` `updated_at` DATETIME NULL");

    await q.query("ALTER TABLE `log` CHANGE COLUMN `created_date` `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");
  },

  async down(queryInterface) {
    const q = queryInterface.sequelize;

    await q.query("ALTER TABLE `company` CHANGE COLUMN `created_at` `created_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");
    await q.query("ALTER TABLE `company` CHANGE COLUMN `updated_at` `updated_date` DATETIME NULL");

    await q.query("ALTER TABLE `business_unit` CHANGE COLUMN `created_at` `created_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");
    await q.query("ALTER TABLE `business_unit` CHANGE COLUMN `updated_at` `updated_date` DATETIME NULL");

    await q.query("ALTER TABLE `role` CHANGE COLUMN `created_at` `created_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");
    await q.query("ALTER TABLE `role` CHANGE COLUMN `updated_at` `updated_date` DATETIME NULL");

    await q.query("ALTER TABLE `user` CHANGE COLUMN `created_at` `created_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");
    await q.query("ALTER TABLE `user` CHANGE COLUMN `updated_at` `updated_date` DATETIME NULL");

    await q.query("ALTER TABLE `log` CHANGE COLUMN `created_at` `created_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");
  },
};

"use strict";

// Unifica con la convención ya usada en `company` (`logo_url`,
// `bcp_logo_url`, `yape_logo_url`): sustantivo + calificador, no al revés.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.renameColumn("business_unit", "url_logo", "logo_url");
  },

  async down(queryInterface) {
    await queryInterface.renameColumn("business_unit", "logo_url", "url_logo");
  },
};

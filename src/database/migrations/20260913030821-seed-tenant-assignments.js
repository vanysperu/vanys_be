"use strict";

// Migración de datos (no de esquema): asigna la data ya sembrada
// (20260912233700-seed-core-data) a la jerarquía tenant recién creada.
// jharol (user id 1) queda en la tienda NASA (business_unit id 1); los
// roles no-system (Administrador, Especialista) quedan de la empresa NASA
// (company id 1). El rol Super Administrador (id 1) se queda company_id
// NULL a propósito: es un rol de plataforma, no de una empresa.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query("UPDATE `user` SET business_unit_id = 1 WHERE id = 1");
    await queryInterface.sequelize.query("UPDATE `role` SET company_id = 1 WHERE id IN (2, 3)");
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query("UPDATE `user` SET business_unit_id = NULL WHERE id = 1");
    await queryInterface.sequelize.query("UPDATE `role` SET company_id = NULL WHERE id IN (2, 3)");
  },
};

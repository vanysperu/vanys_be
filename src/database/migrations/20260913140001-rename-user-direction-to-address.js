"use strict";

// `direction` era un falso cognado de "dirección" (domicilio). En inglés
// "direction" significa rumbo/sentido, no domicilio -- el nombre correcto
// es "address".

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.renameColumn("user", "direction", "address");
  },

  async down(queryInterface) {
    await queryInterface.renameColumn("user", "address", "direction");
  },
};

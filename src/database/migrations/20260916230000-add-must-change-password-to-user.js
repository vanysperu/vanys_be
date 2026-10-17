"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // true = el usuario debe cambiar su contraseña antes de poder usar el
    // resto del sistema (ver middlewares/require-password-changed.ts).
    // Se activa al crear un usuario con la contraseña temporal fija; se
    // apaga automáticamente cuando cambia su contraseña.
    await queryInterface.addColumn("user", "must_change_password", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("user", "must_change_password");
  },
};

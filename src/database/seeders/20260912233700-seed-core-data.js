"use strict";

const bcrypt = require("bcrypt");

const SALT_ROUNDS = 10;

// Datos base para arrancar el sistema desde una base de datos vacía:
// una compañía/business_unit de ejemplo, los 3 roles base (el primero
// marcado is_system para no quedar nunca bloqueado del propio panel de
// administración), y el usuario admin inicial.
module.exports = {
  async up(queryInterface) {
    const now = new Date();

    await queryInterface.bulkInsert("company", [
      {
        id: 1,
        ruc: "00000000000",
        business_name: "NASA",
        description: "Compañía inicial de ejemplo",
        is_deleted: false,
        created_at: now,
      },
    ]);

    await queryInterface.bulkInsert("business_unit", [
      {
        id: 1,
        business_code: "NASA",
        logo_url: "",
        company_id: 1,
        primary_color: "#E33930",
        secondary_color: "#005293",
        is_deleted: false,
        created_at: now,
      },
    ]);

    await queryInterface.bulkInsert("role", [
      { id: 1, name: "Super Administrador", description: "Acceso total al sistema", status: true, is_system: true, created_at: now },
      { id: 2, name: "Administrador", description: "Administrador del sistema", status: true, is_system: false, created_at: now },
      { id: 3, name: "Especialista", description: "Usuario especialista", status: true, is_system: false, created_at: now },
    ]);

    const salt = bcrypt.genSaltSync(SALT_ROUNDS);
    const password = bcrypt.hashSync("jharol", salt);

    await queryInterface.bulkInsert("user", [
      {
        id: 1,
        name: "Jharol",
        paternal_lastname: "Admin",
        email: "jharol@gmail.com",
        password,
        salt,
        status: true,
        gender: 1,
        login_status: "H",
        failed_attempts: 0,
        is_deleted: false,
        created_at: now,
      },
    ]);

    await queryInterface.bulkInsert("user_role", [{ user_id: 1, role_id: 1 }]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("user_role", null, {});
    await queryInterface.bulkDelete("user", null, {});
    await queryInterface.bulkDelete("role", null, {});
    await queryInterface.bulkDelete("business_unit", null, {});
    await queryInterface.bulkDelete("company", null, {});
  },
};

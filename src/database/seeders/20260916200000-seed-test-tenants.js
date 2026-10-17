"use strict";

const bcrypt = require("bcrypt");
const SALT_ROUNDS = 10;

// Data de prueba para validar de punta a punta el aislamiento multi-tenant:
// 2 empresas nuevas, cada una con 2 tiendas (Acme) o 1 (Globex), un usuario
// administrador por tienda, y variables generales propias de cada empresa
// (además de las globales ya sembradas: document_type, gender).
//
// Todas las contraseñas de prueba son "Test1234".
module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    const salt = bcrypt.genSaltSync(SALT_ROUNDS);
    const password = bcrypt.hashSync("Test1234", salt);

    // ---- Empresas (company id 1 = NASA ya existe) ----
    await queryInterface.bulkInsert("company", [
      {
        id: 2,
        ruc: "20100000002",
        business_name: "Acme Corp",
        description: "Empresa de prueba para validar aislamiento multi-tenant",
        theme_color: "violet",
        is_deleted: false,
        created_at: now,
      },
      {
        id: 3,
        ruc: "20100000003",
        business_name: "Globex Corp",
        description: "Empresa de prueba para validar aislamiento multi-tenant",
        theme_color: "green",
        is_deleted: false,
        created_at: now,
      },
    ]);

    // ---- Tiendas (business_unit id 1 = NASA ya existe) ----
    await queryInterface.bulkInsert("business_unit", [
      {
        id: 2,
        business_code: "ACME-LIMA",
        logo_url: "",
        primary_color: "#7239EA",
        secondary_color: "#5014D0",
        company_id: 2,
        is_deleted: false,
        created_at: now,
      },
      {
        id: 3,
        business_code: "ACME-AREQUIPA",
        logo_url: "",
        primary_color: "#7239EA",
        secondary_color: "#5014D0",
        company_id: 2,
        is_deleted: false,
        created_at: now,
      },
      {
        id: 4,
        business_code: "GLOBEX-CENTRAL",
        logo_url: "",
        primary_color: "#17C653",
        secondary_color: "#0FAE47",
        company_id: 3,
        is_deleted: false,
        created_at: now,
      },
    ]);

    // ---- Roles propios de cada empresa (role id 1 = Super Administrador,
    // 2/3 = Administrador/Especialista de NASA ya existen) ----
    await queryInterface.bulkInsert("role", [
      { id: 4, name: "Administrador", description: "Administrador de Acme Corp", status: true, is_system: false, company_id: 2, created_at: now },
      { id: 5, name: "Administrador", description: "Administrador de Globex Corp", status: true, is_system: false, company_id: 3, created_at: now },
    ]);

    // Los nuevos roles heredan exactamente los mismos accesos que el rol
    // "Administrador" de NASA (role_id 2) — el catálogo de resources es
    // compartido entre empresas, solo cambia a qué rol se le otorga.
    await queryInterface.sequelize.query(`
      INSERT INTO roles_resources (role_id, resource_id, created_by, created_at)
      SELECT 4, resource_id, NULL, NOW() FROM roles_resources WHERE role_id = 2
    `);
    await queryInterface.sequelize.query(`
      INSERT INTO roles_resources (role_id, resource_id, created_by, created_at)
      SELECT 5, resource_id, NULL, NOW() FROM roles_resources WHERE role_id = 2
    `);

    // ---- Usuarios (user id 1 = jharol ya existe) ----
    await queryInterface.bulkInsert("user", [
      {
        id: 2,
        name: "Ana",
        paternal_lastname: "Acme",
        email: "admin@acme.test",
        password,
        salt,
        status: true,
        gender: 5,
        document_type: 1,
        document_number: "10000002",
        business_unit_id: 2,
        login_status: "H",
        failed_attempts: 0,
        is_deleted: false,
        created_at: now,
      },
      {
        id: 3,
        name: "Luis",
        paternal_lastname: "Acme",
        email: "admin.arequipa@acme.test",
        password,
        salt,
        status: true,
        gender: 4,
        document_type: 1,
        document_number: "10000003",
        business_unit_id: 3,
        login_status: "H",
        failed_attempts: 0,
        is_deleted: false,
        created_at: now,
      },
      {
        id: 4,
        name: "Elena",
        paternal_lastname: "Globex",
        email: "admin@globex.test",
        password,
        salt,
        status: true,
        gender: 5,
        document_type: 1,
        document_number: "10000004",
        business_unit_id: 4,
        login_status: "H",
        failed_attempts: 0,
        is_deleted: false,
        created_at: now,
      },
    ]);

    await queryInterface.bulkInsert("user_role", [
      { user_id: 2, role_id: 4 },
      { user_id: 3, role_id: 4 },
      { user_id: 4, role_id: 5 },
    ]);

    // ---- Variables generales propias de cada empresa (no globales) ----
    await queryInterface.bulkInsert("general_variable", [
      {
        category: "product_category",
        title: "Categoría de producto",
        prefix_id: "ELEC",
        name: "Electrónica",
        description: "Solo visible para Acme Corp",
        ref1: null,
        ref2: null,
        company_id: 2,
      },
      {
        category: "product_category",
        title: "Categoría de producto",
        prefix_id: "MOB",
        name: "Muebles",
        description: "Solo visible para Acme Corp",
        ref1: null,
        ref2: null,
        company_id: 2,
      },
      {
        category: "product_category",
        title: "Categoría de producto",
        prefix_id: "SOFT",
        name: "Software",
        description: "Solo visible para Globex Corp",
        ref1: null,
        ref2: null,
        company_id: 3,
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("general_variable", { company_id: [2, 3] });
    await queryInterface.bulkDelete("user_role", { user_id: [2, 3, 4] });
    await queryInterface.bulkDelete("user", { id: [2, 3, 4] });
    await queryInterface.bulkDelete("roles_resources", { role_id: [4, 5] });
    await queryInterface.bulkDelete("role", { id: [4, 5] });
    await queryInterface.bulkDelete("business_unit", { id: [2, 3, 4] });
    await queryInterface.bulkDelete("company", { id: [2, 3] });
  },
};

"use strict";

/**
 * Siembra (o re-sincroniza) las cuentas/datos QA que usa la suite de
 * Playwright de grulla_fe (e2e/auth.ts): un Super Administrador aparte, una
 * empresa "Acme Corp QA" con su tienda, y usuarios de esa empresa con los
 * roles plantilla "Administrador" y "Gestor" (company_id NULL, compartidos
 * — ver roles_resources.controller.ts).
 *
 * Idempotente por upsert (no delete+recreate): las corridas de tests dejan
 * cotizaciones/órdenes de compra que referencian estos usuarios por FK
 * (ej. purchase_order.assigned_to ON DELETE RESTRICT), así que borrar y
 * re-crear la fila rompía en cuanto ya existía data real de pruebas. Si la
 * empresa/usuario ya existen, se actualizan en vez de recrearse.
 *
 * Nunca toca el Super Admin real (admin@acme.test) ni ninguna otra empresa
 * existente — solo lee/escribe por el email o el ruc exactos de abajo.
 *
 * Uso: node scripts/seed-qa-fixtures.js   (desde grulla_be/)
 *      o: npm run db:seed-qa
 */

require("dotenv").config();
const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");

const SALT_ROUNDS = 10;
const PASSWORD = "Test1234";
const COMPANY_RUC = "20999999999";
const COMPANY_NAME = "Acme Corp QA";
const BUSINESS_UNIT_CODE = "ACME-QA";

const ADMIN_ROLE_ID = 2; // "Administrador", rol plantilla compartido (company_id NULL)
const SUPERADMIN_ROLE_ID = 1; // "Super Administrador", is_system
const GESTOR_ROLE_ID = 6; // "Gestor", rol plantilla compartido — acceso operativo limitado

const USERS = [
  { name: "QA", paternal_lastname: "Superadmin", email: "qa.superadmin@grulla.test", roleId: SUPERADMIN_ROLE_ID, scoped: false },
  // "Ana Acme" — el nombre lo esperan literal algunos specs (quotations.spec.ts).
  { name: "Ana", paternal_lastname: "Acme", email: "admin.qa@acme.test", roleId: ADMIN_ROLE_ID, scoped: true },
  // Cuenta exclusiva del spec de login (nunca reusada como storageState) —
  // así no invalida la sesión guardada del admin QA de arriba.
  { name: "Login", paternal_lastname: "Flow", email: "login.qa@grulla.test", roleId: ADMIN_ROLE_ID, scoped: true },
  // Necesario para probar que el RBAC oculta/rechaza correctamente los
  // botones y vistas exclusivos de Administrador (ej. editar/anular pagos,
  // "Deudas a personal").
  { name: "Gus", paternal_lastname: "Gestor", email: "gestor.qa@acme.test", roleId: GESTOR_ROLE_ID, scoped: true },
];

async function getConnection() {
  return mysql.createConnection({
    host: process.env.PROY_BD_HOST,
    port: Number(process.env.PROY_BD_PORT),
    user: process.env.PROY_BD_USER,
    password: process.env.PROY_BD_PASS,
    database: process.env.PROY_BD,
  });
}

function hashPassword() {
  const salt = bcrypt.genSaltSync(SALT_ROUNDS);
  const password = bcrypt.hashSync(PASSWORD, salt);
  return { password, salt };
}

// Paleta por defecto ("blue" = azul marino + naranja de Vanys): la empresa de
// pruebas se ve igual que una empresa real recién creada.
async function upsertCompany(conn) {
  const [existing] = await conn.query("SELECT id FROM `company` WHERE ruc = ?", [COMPANY_RUC]);
  if (existing.length) return existing[0].id;

  const [result] = await conn.query(
    `INSERT INTO \`company\` (ruc, business_name, description, theme_color, is_deleted, created_at)
     VALUES (?, ?, 'Empresa dedicada a la suite de pruebas E2E (Playwright)', 'blue', false, NOW())`,
    [COMPANY_RUC, COMPANY_NAME],
  );
  return result.insertId;
}

async function upsertBusinessUnit(conn, companyId) {
  const [existing] = await conn.query("SELECT id FROM `business_unit` WHERE company_id = ? AND business_code = ?", [
    companyId,
    BUSINESS_UNIT_CODE,
  ]);
  if (existing.length) return existing[0].id;

  const [result] = await conn.query(
    `INSERT INTO \`business_unit\`
      (business_code, logo_url, primary_color, secondary_color, company_id, is_deleted, created_at)
     VALUES (?, '', '#7239EA', '#5014D0', ?, false, NOW())`,
    [BUSINESS_UNIT_CODE, companyId],
  );
  return result.insertId;
}

async function upsertUser(conn, { name, paternal_lastname, email, roleId, companyId, businessUnitId }) {
  const { password, salt } = hashPassword();
  const [existing] = await conn.query("SELECT id FROM `user` WHERE email = ?", [email]);

  let userId;
  if (existing.length) {
    userId = existing[0].id;
    await conn.query(
      `UPDATE \`user\` SET name=?, paternal_lastname=?, password=?, salt=?, status=true, is_deleted=false,
        company_id=?, business_unit_id=?, must_change_password=false, failed_attempts=0 WHERE id=?`,
      [name, paternal_lastname, password, salt, companyId, businessUnitId, userId],
    );
    await conn.query("DELETE FROM `user_role` WHERE user_id = ?", [userId]);
  } else {
    const [result] = await conn.query(
      `INSERT INTO \`user\`
        (name, paternal_lastname, email, password, salt, status, gender, login_status, failed_attempts, is_deleted, company_id, business_unit_id, created_at)
       VALUES (?, ?, ?, ?, ?, true, 5, 'H', 0, false, ?, ?, NOW())`,
      [name, paternal_lastname, email, password, salt, companyId, businessUnitId],
    );
    userId = result.insertId;
  }

  await conn.query("INSERT INTO `user_role` (user_id, role_id) VALUES (?, ?)", [userId, roleId]);
  return userId;
}

// Estos usuarios tienen contraseña conocida (Test1234) y uno es Super
// Administrador: sembrarlos en producción le daría acceso total a cualquiera
// que lea este repositorio. Mismo candado que reset-to-factory.js.
function assertNotProduction() {
  const dbName = process.env.PROY_BD || "";
  const looksLikeDev = /(_dev|_test|_qa|_local)$/i.test(dbName);
  if (process.env.NODE_ENV !== "production" && looksLikeDev) return;

  console.error(
    `✗ Fixtures QA BLOQUEADAS para la base "${dbName}" (NODE_ENV=${process.env.NODE_ENV || "—"}).\n` +
      "  Crean usuarios con contraseña conocida, incluido un Super Administrador.\n" +
      "  Solo se siembran en bases de desarrollo (nombre terminado en _dev, _test, _qa o _local)."
  );
  process.exit(1);
}

async function main() {
  assertNotProduction();
  const conn = await getConnection();

  const companyId = await upsertCompany(conn);
  const businessUnitId = await upsertBusinessUnit(conn, companyId);

  console.log("✔ Fixtures QA listas:");
  for (const user of USERS) {
    await upsertUser(conn, {
      ...user,
      companyId: user.scoped ? companyId : null,
      businessUnitId: user.scoped ? businessUnitId : null,
    });
    console.log(`  - ${user.email} / ${PASSWORD}`);
  }

  await conn.end();
}

main().catch((err) => {
  console.error("✗ Seed de fixtures QA falló:", err);
  process.exit(1);
});

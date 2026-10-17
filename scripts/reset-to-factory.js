"use strict";

/**
 * Reset de fábrica para `grulla_dev`.
 *
 * Borra TODO (empresas, tiendas, usuarios, cotizaciones, clientes, etc.) y
 * deja la base de datos en el mismo estado que tendría una instalación
 * nueva: solo el catálogo RBAC de fábrica (módulos/resources/roles
 * plantilla/grants), los themes, las variables generales globales
 * (company_id NULL), y un único usuario Super Administrador.
 *
 * Uso: node scripts/reset-to-factory.js   (desde grulla_be/)
 *      o: npm run db:reset-factory
 *
 * ADVERTENCIA: operación destructiva e irreversible sobre la BD indicada
 * en el .env (PROY_BD*). No correr nunca contra una base de datos de
 * producción real.
 */

require("dotenv").config();
const { execSync } = require("child_process");
const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");

const SALT_ROUNDS = 10;
const SUPERADMIN_EMAIL = "admin@acme.test";
const SUPERADMIN_PASSWORD = "Test1234";
const SUPERADMIN_ROLE_ID = 1; // "Super Administrador", is_system = true (seed-core-data.js)

async function getConnection() {
  return mysql.createConnection({
    host: process.env.PROY_BD_HOST,
    port: Number(process.env.PROY_BD_PORT),
    user: process.env.PROY_BD_USER,
    password: process.env.PROY_BD_PASS,
    database: process.env.PROY_BD,
    multipleStatements: true,
  });
}

async function truncateAllTables(conn) {
  const [rows] = await conn.query("SHOW TABLES");
  const tableKey = `Tables_in_${process.env.PROY_BD}`;
  const tables = rows.map((row) => row[tableKey]);

  await conn.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const table of tables) {
    // sequelizemeta se conserva: el esquema no cambia, solo se vacían datos.
    // sequelizedata sí se trunca para que db:seed:all vuelva a correr todos
    // los seeders de fábrica desde cero.
    if (table === "sequelizemeta") continue;
    await conn.query(`TRUNCATE TABLE \`${table}\``);
  }
  await conn.query("SET FOREIGN_KEY_CHECKS = 1");

  console.log(`✔ ${tables.length - 1} tablas truncadas (sequelizemeta preservada).`);
}

function runFactorySeeders() {
  console.log("→ Corriendo seeders de fábrica (npx sequelize-cli db:seed:all)...");
  execSync("npx sequelize-cli db:seed:all", { stdio: "inherit", cwd: __dirname + "/.." });
}

async function stripNonFactoryData(conn) {
  // Los seeders de fábrica también siembran datos de ejemplo/prueba que NO
  // deben sobrevivir al reset: la compañía NASA de ejemplo (seed-core-data),
  // el usuario jharol@gmail.com, y los tenants Acme Corp/Globex Corp con sus
  // tiendas/usuarios/roles/variables propias (seed-test-tenants). Lo único
  // "de fábrica" de verdad es lo que tiene company_id = NULL.
  await conn.query("SET FOREIGN_KEY_CHECKS = 0");
  await conn.query("TRUNCATE TABLE `user_role`");
  await conn.query("TRUNCATE TABLE `user`");
  await conn.query("DELETE FROM `roles_resources` WHERE role_id IN (SELECT id FROM `role` WHERE company_id IS NOT NULL)");
  await conn.query("DELETE FROM `role` WHERE company_id IS NOT NULL");
  await conn.query("DELETE FROM `general_variable` WHERE company_id IS NOT NULL");
  await conn.query("TRUNCATE TABLE `business_unit`");
  await conn.query("TRUNCATE TABLE `company`");
  await conn.query("SET FOREIGN_KEY_CHECKS = 1");

  console.log("✔ Datos de ejemplo/prueba (companies, tiendas, usuarios, roles de empresa) eliminados.");
}

async function insertSuperAdmin(conn) {
  const salt = bcrypt.genSaltSync(SALT_ROUNDS);
  const password = bcrypt.hashSync(SUPERADMIN_PASSWORD, salt);

  const [result] = await conn.query(
    `INSERT INTO \`user\`
      (name, paternal_lastname, email, password, salt, status, gender, login_status, failed_attempts, is_deleted, company_id, business_unit_id, created_at)
     VALUES (?, ?, ?, ?, ?, true, 1, 'H', 0, false, NULL, NULL, NOW())`,
    ["Super", "Administrador", SUPERADMIN_EMAIL, password, salt],
  );

  await conn.query("INSERT INTO `user_role` (user_id, role_id) VALUES (?, ?)", [result.insertId, SUPERADMIN_ROLE_ID]);

  console.log(`✔ Super Administrador creado: ${SUPERADMIN_EMAIL} / ${SUPERADMIN_PASSWORD}`);
}

// Candado contra el peor accidente posible: correr esto con las variables de
// producción cargadas borra TODOS los datos reales de todas las empresas.
// Se bloquea si NODE_ENV=production o si la base no es de desarrollo, salvo
// que se confirme explícitamente con ALLOW_DESTRUCTIVE_RESET=yes.
function assertSafeToReset() {
  const dbName = process.env.PROY_BD || "";
  const looksLikeDev = /(_dev|_test|_qa|_local)$/i.test(dbName);
  const isProduction = process.env.NODE_ENV === "production";
  if (!isProduction && looksLikeDev) return;
  if (process.env.ALLOW_DESTRUCTIVE_RESET === "yes") return;

  console.error(
    `✗ Reset BLOQUEADO para la base "${dbName}" (NODE_ENV=${process.env.NODE_ENV || "—"}).\n` +
      "  Este script borra TODA la información. Solo corre sobre bases de desarrollo\n" +
      "  (nombre terminado en _dev, _test, _qa o _local). Si de verdad quieres\n" +
      "  borrar esta base, repite el comando con ALLOW_DESTRUCTIVE_RESET=yes."
  );
  process.exit(1);
}

async function main() {
  assertSafeToReset();
  console.log(`⚠ Reseteando "${process.env.PROY_BD}" a estado de fábrica — esto borra TODA la información existente.`);

  const conn = await getConnection();
  await truncateAllTables(conn);
  await conn.end();

  runFactorySeeders();

  const conn2 = await getConnection();
  await stripNonFactoryData(conn2);
  await insertSuperAdmin(conn2);
  await conn2.end();

  console.log("\n✅ Reset completo. La base de datos solo tiene el catálogo de fábrica (módulos, resources, roles plantilla, themes, variables generales globales) y el Super Administrador.");
}

main().catch((err) => {
  console.error("✗ Reset falló:", err);
  process.exit(1);
});

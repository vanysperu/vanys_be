"use strict";

/**
 * Genera el .sql de PRODUCCIÓN: esquema completo + catálogo de fábrica
 * (módulos, resources, roles plantilla, permisos, themes, variables
 * generales globales) + UN Super Administrador con contraseña temporal.
 *
 * Por qué un .sql y no `sequelize-cli db:migrate` en el servidor: el hosting
 * de producción (Hostinger sin VPS) no permite correr comandos npm. La forma
 * documentada de crear la base es importar un .sql desde phpMyAdmin.
 *
 * Cómo lo arma, sin tocar la base de desarrollo:
 *   1. Crea un esquema temporal propio (grulla_build_tmp) en el MySQL local.
 *   2. Corre TODAS las migraciones y seeders de fábrica ahí — exactamente
 *      los mismos que usa desarrollo, así producción nace idéntica.
 *   3. Borra los datos de ejemplo/prueba que algunos seeders siembran
 *      (mismo criterio que scripts/reset-to-factory.js).
 *   4. Crea el Super Administrador de producción.
 *   5. Exporta esquema + datos a SQL plano, compatible con MySQL y MariaDB.
 *   6. Lo vuelve a importar en otro esquema temporal para comprobar que el
 *      archivo realmente carga sin errores, y borra los temporales.
 */

const { execSync } = require("child_process");
const path = require("path");
const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");

const BACKEND_ROOT = path.resolve(__dirname, "..", "..");
const BUILD_SCHEMA = "grulla_build_tmp";
const VERIFY_SCHEMA = "grulla_build_verify";
const SUPERADMIN_ROLE_ID = 1; // "Super Administrador", is_system (seed-core-data.js)
const SALT_ROUNDS = 10;
const INSERT_BATCH_SIZE = 100;

// Candado: este script solo crea y borra esquemas propios con este prefijo,
// jamás la base configurada en PROY_BD ni ninguna otra.
const OWNED_SCHEMA_PREFIX = "grulla_build_";

const assertOwnedSchema = (schema) => {
  if (!schema.startsWith(OWNED_SCHEMA_PREFIX)) {
    throw new Error(`Esquema "${schema}" fuera del prefijo propio ${OWNED_SCHEMA_PREFIX}: no se toca.`);
  }
};

const connect = (database) =>
  mysql.createConnection({
    host: process.env.PROY_BD_HOST,
    port: Number(process.env.PROY_BD_PORT) || 3306,
    user: process.env.PROY_BD_USER,
    password: process.env.PROY_BD_PASS,
    database,
    multipleStatements: true,
    // Fechas tal cual están guardadas (sin convertir de zona) y BIGINT/
    // DECIMAL como texto (sin perder precisión) al exportar.
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
  });

const recreateSchema = async (conn, schema) => {
  assertOwnedSchema(schema);
  await conn.query(`DROP DATABASE IF EXISTS \`${schema}\``);
  await conn.query(`CREATE DATABASE \`${schema}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
};

const dropSchema = async (conn, schema) => {
  assertOwnedSchema(schema);
  await conn.query(`DROP DATABASE IF EXISTS \`${schema}\``);
};

// Migraciones + seeders de fábrica contra el esquema temporal. PROY_BD se
// pisa solo para el proceso hijo (database.cli.js lee esa variable y dotenv
// nunca sobrescribe una que ya venga del entorno).
const runMigrationsAndSeeders = () => {
  const env = { ...process.env, PROY_BD: BUILD_SCHEMA, NODE_ENV: "development" };
  const options = { cwd: BACKEND_ROOT, env, stdio: "pipe" };
  execSync("npx sequelize-cli db:migrate", options);
  execSync("npx sequelize-cli db:seed:all", options);
};

// Mismo criterio que scripts/reset-to-factory.js: lo único "de fábrica" es
// lo que tiene company_id = NULL. Empresas, tiendas, usuarios y roles de
// empresa que siembran los seeders son datos de ejemplo/prueba.
const stripNonFactoryData = async (conn) => {
  await conn.query(`
    SET FOREIGN_KEY_CHECKS = 0;
    TRUNCATE TABLE \`user_role\`;
    TRUNCATE TABLE \`user\`;
    DELETE FROM \`roles_resources\` WHERE role_id IN (SELECT id FROM \`role\` WHERE company_id IS NOT NULL);
    DELETE FROM \`role\` WHERE company_id IS NOT NULL;
    DELETE FROM \`general_variable\` WHERE company_id IS NOT NULL;
    TRUNCATE TABLE \`business_unit\`;
    TRUNCATE TABLE \`company\`;
    SET FOREIGN_KEY_CHECKS = 1;
  `);
};

// Nace con must_change_password = 1: el primer login obliga a cambiar la
// contraseña temporal antes de poder usar cualquier otra parte del sistema.
const insertSuperAdmin = async (conn, { email, password, name, lastName }) => {
  const salt = bcrypt.genSaltSync(SALT_ROUNDS);
  const hash = bcrypt.hashSync(password, salt);

  const [result] = await conn.query(
    `INSERT INTO \`user\`
      (name, paternal_lastname, email, password, salt, status, gender, login_status, failed_attempts,
       is_deleted, must_change_password, company_id, business_unit_id, created_at)
     VALUES (?, ?, ?, ?, ?, 1, 1, 'H', 0, 0, 1, NULL, NULL, UTC_TIMESTAMP())`,
    [name, lastName, email, hash, salt]
  );
  await conn.query("INSERT INTO `user_role` (user_id, role_id, created_at) VALUES (?, ?, UTC_TIMESTAMP())", [
    result.insertId,
    SUPERADMIN_ROLE_ID,
  ]);
};

// Ajusta el DDL de MySQL 8 para que también cargue en MariaDB (lo que suele
// usar un hosting compartido): MariaDB no conoce la colación
// utf8mb4_0900_ai_ci de MySQL 8, y la importación falla en la primera tabla.
// Todo queda en utf8mb4_unicode_ci, que existe en ambos. Se quita además el
// AUTO_INCREMENT=N (lo fijan solos los INSERT con id explícito).
const normalizeDdl = (ddl) =>
  ddl
    .replace(/utf8mb4_0900_ai_ci/g, "utf8mb4_unicode_ci")
    .replace(/utf8mb3_(unicode|general)_ci/g, "utf8mb4_unicode_ci")
    .replace(/\butf8mb3\b/g, "utf8mb4")
    .replace(/ AUTO_INCREMENT=\d+/, "");

// Tablas donde sequelize-cli anota qué migraciones/seeders ya corrieron. Un
// MySQL en Windows guarda los nombres en minúscula (lower_case_table_names=1),
// pero el MySQL/MariaDB de Hostinger corre en Linux y distingue mayúsculas:
// si el .sql trae "sequelizemeta", sequelize-cli no la encuentra, crea una
// "SequelizeMeta" vacía y al actualizar intenta correr TODAS las migraciones
// de nuevo sobre tablas que ya existen. Se exportan con su nombre exacto.
const CANONICAL_TABLE_NAMES = {
  sequelizemeta: "SequelizeMeta",
  sequelizedata: "SequelizeData",
};

const canonicalTableName = (name) => CANONICAL_TABLE_NAMES[name.toLowerCase()] ?? name;

const dumpSchema = async (conn, schema) => {
  const [tables] = await conn.query(
    "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
    [schema]
  );

  const ddlParts = [];
  const dataParts = [];
  const rowCounts = {};

  for (const { name } of tables) {
    const exportName = canonicalTableName(name);
    const [[createRow]] = await conn.query(`SHOW CREATE TABLE \`${name}\``);
    const ddl = normalizeDdl(createRow["Create Table"]).replace(
      `CREATE TABLE \`${name}\``,
      `CREATE TABLE \`${exportName}\``
    );
    ddlParts.push(`${ddl};`);

    const [rows, fields] = await conn.query(`SELECT * FROM \`${name}\``);
    rowCounts[exportName] = rows.length;
    if (rows.length === 0) continue;

    const columns = fields.map((field) => `\`${field.name}\``).join(", ");
    for (let start = 0; start < rows.length; start += INSERT_BATCH_SIZE) {
      const values = rows
        .slice(start, start + INSERT_BATCH_SIZE)
        .map((row) => `(${conn.escape(fields.map((field) => row[field.name]))})`)
        .join(",\n  ");
      dataParts.push(`INSERT INTO \`${exportName}\` (${columns}) VALUES\n  ${values};`);
    }
  }

  return { ddl: ddlParts.join("\n\n"), data: dataParts.join("\n\n"), rowCounts };
};

const renderSqlFile = ({ ddl, data, adminEmail }) =>
  [
    "-- =====================================================================",
    "-- Grulla — base de datos de PRODUCCIÓN",
    "-- Esquema completo + catálogo de fábrica + Super Administrador inicial.",
    `-- Generado: ${new Date().toISOString()}`,
    `-- Super Administrador: ${adminEmail} (contraseña temporal: ver CREDENCIALES-INICIALES.txt)`,
    "--",
    "-- Importar UNA sola vez, en una base de datos VACÍA (phpMyAdmin > Importar).",
    "-- No incluye DROP TABLE a propósito: si por error se importa sobre una",
    "-- base con datos, falla al crear la primera tabla en vez de borrarlos.",
    "-- =====================================================================",
    "",
    "SET NAMES utf8mb4;",
    "SET FOREIGN_KEY_CHECKS = 0;",
    "SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';",
    "SET time_zone = '+00:00';",
    "",
    "-- ---------------------------------------------------------------------",
    "-- Esquema",
    "-- ---------------------------------------------------------------------",
    "",
    ddl,
    "",
    "-- ---------------------------------------------------------------------",
    "-- Datos de fábrica",
    "-- ---------------------------------------------------------------------",
    "",
    data,
    "",
    "SET FOREIGN_KEY_CHECKS = 1;",
    "",
  ].join("\n");

// Carga el .sql recién generado en un esquema limpio: si tiene un error de
// sintaxis o de compatibilidad, falla acá y no en el phpMyAdmin del hosting.
const verifyImport = async (conn, sql) => {
  await recreateSchema(conn, VERIFY_SCHEMA);
  await conn.query(`USE \`${VERIFY_SCHEMA}\``);
  await conn.query(sql);

  const [[{ tables }]] = await conn.query(
    "SELECT COUNT(*) AS tables FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?",
    [VERIFY_SCHEMA]
  );
  const [[{ admins }]] = await conn.query(
    "SELECT COUNT(*) AS admins FROM `user` u JOIN `user_role` ur ON ur.user_id = u.id WHERE ur.role_id = ?",
    [SUPERADMIN_ROLE_ID]
  );
  // Sin este registro, una actualización posterior volvería a correr todas
  // las migraciones (ver CANONICAL_TABLE_NAMES).
  const [[{ migrations }]] = await conn.query("SELECT COUNT(*) AS migrations FROM `SequelizeMeta`");
  await dropSchema(conn, VERIFY_SCHEMA);
  return { tables: Number(tables), admins: Number(admins), migrations: Number(migrations) };
};

async function buildProductionSql({ adminEmail, adminPassword, adminName = "Super", adminLastName = "Administrador" }) {
  const server = await connect(undefined);
  try {
    await recreateSchema(server, BUILD_SCHEMA);
    runMigrationsAndSeeders();

    await server.query(`USE \`${BUILD_SCHEMA}\``);
    await stripNonFactoryData(server);
    await insertSuperAdmin(server, { email: adminEmail, password: adminPassword, name: adminName, lastName: adminLastName });

    const { ddl, data, rowCounts } = await dumpSchema(server, BUILD_SCHEMA);
    const sql = renderSqlFile({ ddl, data, adminEmail });

    const verification = await verifyImport(server, sql);
    return { sql, rowCounts, verification };
  } finally {
    await dropSchema(server, BUILD_SCHEMA).catch(() => undefined);
    await dropSchema(server, VERIFY_SCHEMA).catch(() => undefined);
    await server.end();
  }
}

module.exports = { buildProductionSql, normalizeDdl, CANONICAL_TABLE_NAMES };

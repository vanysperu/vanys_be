"use strict";

/**
 * Actualiza la base de PRODUCCIÓN (Hostinger) a la versión nueva del código:
 * corre SOLO las migraciones y seeders que todavía no se aplicaron allí.
 *
 * Por qué existe: Hostinger sin VPS no permite correr `npm` en el servidor,
 * así que la actualización se lanza desde la PC contra el MySQL remoto (ver
 * deploy/GUIA-DESPLIEGUE-HOSTINGER.md, "Publicar una versión nueva").
 *
 * Uso (Git Bash, desde grulla_be/):
 *   PROD_BD_HOST=srvXXXX.hstgr.io PROD_BD=u123_grulla \
 *   PROD_BD_USER=u123_usuario PROD_BD_PASS='...' \
 *   npm run db:upgrade-production              -> solo muestra lo pendiente
 *   npm run db:upgrade-production -- --aplicar -> lo aplica
 *
 * Variables PROD_* propias (no las PROY_* del .env): así nunca se apunta a
 * producción por accidente con la configuración de desarrollo, ni a
 * desarrollo creyendo que es producción.
 *
 * Seguridad:
 *   - Sin `--aplicar` no escribe nada (salvo que no hay nada que escribir).
 *   - Corrige el nombre de las tablas de registro de sequelize-cli si un .sql
 *     viejo las dejó en minúscula (ver scripts/lib/production-sql.js).
 *   - Si no encuentra el registro de seeders (SequelizeData), se detiene: sin
 *     él, sequelize-cli correría TODOS los seeders, incluidos los que siembran
 *     empresas y usuarios de ejemplo.
 *   - Los seeders pendientes se corren uno por uno, por nombre (nunca
 *     `db:seed:all`).
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const mysql = require("mysql2/promise");
const { CANONICAL_TABLE_NAMES } = require("./lib/production-sql");

const BACKEND_ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(BACKEND_ROOT, "src", "database", "migrations");
const SEEDERS_DIR = path.join(BACKEND_ROOT, "src", "database", "seeders");
const REQUIRED_VARS = ["PROD_BD_HOST", "PROD_BD", "PROD_BD_USER", "PROD_BD_PASS"];
const APPLY = process.argv.includes("--aplicar");

const fail = (message) => {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
};

const target = () => {
  const missing = REQUIRED_VARS.filter((name) => !process.env[name]);
  if (missing.length > 0) fail(`Faltan variables: ${missing.join(", ")} (ver el encabezado de este script).`);
  return {
    host: process.env.PROD_BD_HOST,
    port: Number(process.env.PROD_BD_PORT) || 3306,
    database: process.env.PROD_BD,
    user: process.env.PROD_BD_USER,
    password: process.env.PROD_BD_PASS,
  };
};

const listFiles = (dir) =>
  fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".js"))
    .sort();

// Si un .sql generado en Windows dejó "sequelizemeta"/"sequelizedata" en
// minúscula y el servidor distingue mayúsculas (Linux), se renombran a lo que
// busca sequelize-cli. En un servidor que no distingue, no hace falta.
const normalizeTrackingTables = async (conn, database) => {
  const [[{ lowerCaseNames }]] = await conn.query("SELECT @@lower_case_table_names AS lowerCaseNames");
  const [rows] = await conn.query(
    "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND LOWER(TABLE_NAME) IN ('sequelizemeta', 'sequelizedata')",
    [database]
  );
  const existing = rows.map((row) => row.name);
  const renames = [];

  for (const [lower, canonical] of Object.entries(CANONICAL_TABLE_NAMES)) {
    const found = existing.find((name) => name.toLowerCase() === lower);
    if (!found) fail(`No existe la tabla ${canonical} en ${database}: ¿la base se creó con grulla_produccion.sql?`);
    if (found === canonical || Number(lowerCaseNames) !== 0) continue;
    renames.push({ from: found, to: canonical });
  }

  return renames;
};

const readApplied = async (conn, table) => {
  const [rows] = await conn.query(`SELECT name FROM \`${table}\``);
  return new Set(rows.map((row) => row.name));
};

const run = (command, db) =>
  execSync(command, {
    cwd: BACKEND_ROOT,
    stdio: "inherit",
    // database.cli.js lee PROY_BD*; dotenv no pisa variables ya definidas.
    env: {
      ...process.env,
      NODE_ENV: "production",
      PROY_BD_HOST: db.host,
      PROY_BD_PORT: String(db.port),
      PROY_BD: db.database,
      PROY_BD_USER: db.user,
      PROY_BD_PASS: db.password,
    },
  });

async function main() {
  const db = target();
  console.log(`\nBase objetivo: ${db.database} en ${db.host}:${db.port}`);
  console.log(APPLY ? "Modo: APLICAR cambios\n" : "Modo: solo revisar (agrega --aplicar para aplicar)\n");

  const conn = await mysql.createConnection(db);
  try {
    const renames = await normalizeTrackingTables(conn, db.database);
    // Se leen con el nombre que tengan hoy (antes de renombrar).
    const tableNow = (canonical) => renames.find((rename) => rename.to === canonical)?.from ?? canonical;
    const appliedMigrations = await readApplied(conn, tableNow("SequelizeMeta"));
    const appliedSeeders = await readApplied(conn, tableNow("SequelizeData"));

    if (appliedSeeders.size === 0) {
      fail("SequelizeData está vacía: no se puede saber qué seeders ya corrieron. No se aplica nada.");
    }

    const pendingMigrations = listFiles(MIGRATIONS_DIR).filter((file) => !appliedMigrations.has(file));
    const pendingSeeders = listFiles(SEEDERS_DIR).filter((file) => !appliedSeeders.has(file));

    renames.forEach(({ from, to }) => console.log(`  • Renombrar tabla ${from} -> ${to}`));
    console.log(`Migraciones pendientes (${pendingMigrations.length}):`);
    pendingMigrations.forEach((file) => console.log(`  • ${file}`));
    console.log(`Seeders pendientes (${pendingSeeders.length}):`);
    pendingSeeders.forEach((file) => console.log(`  • ${file}`));

    if (renames.length === 0 && pendingMigrations.length === 0 && pendingSeeders.length === 0) {
      console.log("\n✔ La base ya está al día. No hay nada que aplicar.\n");
      return;
    }
    if (!APPLY) {
      console.log("\nNada se modificó. Haz un respaldo (phpMyAdmin > Exportar) y vuelve a correr con --aplicar.\n");
      return;
    }

    for (const { from, to } of renames) {
      await conn.query(`RENAME TABLE \`${from}\` TO \`${to}\``);
    }
    if (pendingMigrations.length > 0) run("npx sequelize-cli db:migrate", db);
    for (const seeder of pendingSeeders) {
      run(`npx sequelize-cli db:seed --seed ${seeder}`, db);
    }
    console.log("\n✔ Base de producción actualizada.\n");
  } finally {
    await conn.end();
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));

"use strict";

/**
 * Backend para la prueba E2E del sistema completo (grulla_fe:
 * `npm run test:e2e:full`). Lo arranca Playwright como webServer.
 *
 * Usa SU PROPIA base (E2E_PROY_BD del .env, ej. grulla_e2e_local), nunca la de
 * desarrollo (PROY_BD) ni la de producción:
 *   1. la crea si no existe;
 *   2. corre las migraciones;
 *   3. la deja de fábrica (scripts/reset-to-factory.js: solo el catálogo RBAC,
 *      las variables globales y el Super Administrador admin@acme.test);
 *   4. levanta el backend en E2E_PROY_APP_PORT.
 * Cada corrida empieza desde cero: la prueba crea la empresa, la tienda, los
 * usuarios y todo lo demás por la interfaz, igual que un cliente nuevo.
 *
 * Uso manual (desde grulla_be/): node scripts/e2e-full-server.js
 */

require("dotenv").config();
const { execSync, spawn } = require("child_process");
const path = require("path");
const mysql = require("mysql2/promise");

const ROOT = path.join(__dirname, "..");
const DB_NAME = (process.env.E2E_PROY_BD ?? "").trim();
const API_PORT = (process.env.E2E_PROY_APP_PORT ?? "4770").trim();
const FRONT_PORT = (process.env.E2E_FRONT_PORT ?? "4270").trim();

// Candado: esta base se BORRA en cada corrida. Solo se acepta un nombre de
// prueba (terminado en _e2e_local / _local / _test) y nunca la base de
// desarrollo del .env (PROY_BD), aunque alguien copie el nombre por error.
const assertDisposableDatabase = () => {
  const failures = [
    [DB_NAME === "", "Falta E2E_PROY_BD en el .env (ej. E2E_PROY_BD=grulla_e2e_local)."],
    [!/^[A-Za-z0-9_]+$/.test(DB_NAME), `E2E_PROY_BD="${DB_NAME}" solo puede tener letras, números y _.`],
    [!/_(local|test)$/i.test(DB_NAME), `E2E_PROY_BD="${DB_NAME}" debe terminar en _local o _test: se borra en cada corrida.`],
    [DB_NAME === process.env.PROY_BD, `E2E_PROY_BD no puede ser la base de desarrollo (${process.env.PROY_BD}).`],
    [process.env.NODE_ENV === "production", "NODE_ENV=production: la prueba E2E nunca corre con la configuración de producción."],
  ];
  const failure = failures.find(([failed]) => failed);
  if (!failure) return;
  console.error(`✗ ${failure[1]}`);
  process.exit(1);
};

// Variables del backend de prueba. dotenv nunca pisa lo que ya viene del
// entorno, así que el backend, sequelize-cli y el reset leen estas.
const e2eEnv = () => ({
  ...process.env,
  NODE_ENV: "development",
  PROY_BD: DB_NAME,
  PROY_APP_PORT: API_PORT,
  PROY_BEURL: `http://localhost:${API_PORT}`,
  PROY_FEURL: `http://localhost:${FRONT_PORT}`,
  // Enlaces de invitación y de la cotización: al frontend de la prueba.
  APP_PUBLIC_URL: `http://localhost:${FRONT_PORT}`,
  // Las migraciones se corren abajo con sequelize-cli, no al arrancar.
  DB_AUTO_MIGRATE: "false",
  // La prueba no necesita el chequeo de tipos de ts-node (ya lo hace tsc): así arranca en segundos.
  TS_NODE_TRANSPILE_ONLY: "true",
});

const createDatabaseIfMissing = async () => {
  const conn = await mysql.createConnection({
    host: process.env.PROY_BD_HOST,
    port: Number(process.env.PROY_BD_PORT),
    user: process.env.PROY_BD_USER,
    password: process.env.PROY_BD_PASS,
  });
  // Mismo charset/collation que la base de desarrollo.
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  await conn.end();
  console.log(`✔ Base ${DB_NAME} lista.`);
};

const run = (command) => execSync(command, { cwd: ROOT, env: e2eEnv(), stdio: "inherit" });

const startBackend = () => {
  console.log(`→ Backend de la prueba en http://localhost:${API_PORT} (base ${DB_NAME}).`);
  const backend = spawn(process.execPath, ["-r", "ts-node/register", "./src/index.ts"], {
    cwd: ROOT,
    env: e2eEnv(),
    stdio: "inherit",
  });
  // Si Playwright corta este proceso, el backend se va con él.
  const stop = () => backend.kill();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  backend.on("exit", (code) => process.exit(code ?? 0));
};

const main = async () => {
  assertDisposableDatabase();
  await createDatabaseIfMissing();
  run("npx sequelize-cli db:migrate");
  run("node scripts/reset-to-factory.js");
  startBackend();
};

main().catch((error) => {
  console.error("✗ No se pudo preparar el backend de la prueba E2E:", error);
  process.exit(1);
});

"use strict";

/**
 * Arma TODO lo necesario para publicar Vanys en el hosting (Hostinger,
 * "Node.js Web App", sin VPS):
 *
 *   deploy/salida/
 *     grulla-app.zip             -> se sube como app Node.js (backend + frontend)
 *     grulla_produccion.sql      -> se importa en phpMyAdmin (base VACÍA)
 *     variables-entorno.env      -> se importa en "Variables de entorno"
 *     CREDENCIALES-INICIALES.txt -> acceso del primer Super Administrador
 *
 * Uso (desde grulla_be/):
 *   npm run release -- --admin-email tu@correo.com
 *
 * Qué verifica antes de entregar el paquete (si algo falla, no genera nada a
 * medias):
 *   - que backend y frontend compilen;
 *   - que el paquete, instalado SOLO con dependencias de producción (como lo
 *     hace el hosting), arranque en modo producción, responda /api/health y
 *     sirva el frontend;
 *   - que el .sql cargue sin errores en una base limpia (ver
 *     lib/production-sql.js).
 *
 * El Super Administrador nace con contraseña temporal aleatoria y está
 * obligado a cambiarla en el primer ingreso.
 */

require("dotenv").config();
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { execSync, spawn } = require("child_process");
const { buildProductionSql } = require("./lib/production-sql");
const { zipDirectory } = require("./lib/zip");

const BACKEND_ROOT = path.resolve(__dirname, "..");
const FRONTEND_ROOT = path.resolve(BACKEND_ROOT, "..", "grulla_fe");
const OUTPUT_DIR = path.resolve(BACKEND_ROOT, "..", "deploy", "salida");
const STAGE_DIR = path.join(OUTPUT_DIR, "app");
const SMOKE_PORT = 4798;
const SMOKE_TIMEOUT_MS = 30_000;

const step = (message) => console.log(`\n→ ${message}`);

const readArg = (flag, fallback) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

// Contraseña temporal legible pero fuerte: sin caracteres ambiguos (0/O,
// 1/l/I) para poder dictarla o copiarla a mano sin errores.
const generateTemporaryPassword = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(16);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
};

// `extraEnv` pisa variables solo para ese comando. Importa para los builds:
// este script carga el .env de DESARROLLO del backend (necesita sus datos
// de MySQL para armar el .sql), y ese .env trae NODE_ENV=development — que
// el `vite build` heredaba y respetaba, generando un bundle con React en
// modo desarrollo (más pesado, más lento, con advertencias en consola).
const run = (command, cwd, extraEnv = {}) =>
  execSync(command, { cwd, stdio: "inherit", env: { ...process.env, ...extraEnv } });

const PRODUCTION_BUILD_ENV = { NODE_ENV: "production" };

// Red de seguridad sobre lo anterior: si por cualquier motivo el bundle trae
// React de desarrollo, el empaquetado se aborta en vez de publicarlo.
const REACT_DEV_BUILD_MARKER = "Download the React DevTools";

const assertProductionFrontendBundle = () => {
  const assetsDir = path.join(FRONTEND_ROOT, "dist", "assets");
  const devFiles = fs
    .readdirSync(assetsDir)
    .filter((file) => file.endsWith(".js"))
    .filter((file) => fs.readFileSync(path.join(assetsDir, file), "utf8").includes(REACT_DEV_BUILD_MARKER));
  if (devFiles.length > 0) {
    throw new Error(`el frontend se compiló con React en modo desarrollo (${devFiles.join(", ")})`);
  }
};

const assertBackendBuild = () => {
  if (!fs.existsSync(path.join(BACKEND_ROOT, "dist", "index.js"))) {
    throw new Error("el build del backend no generó dist/index.js");
  }
};

const copyDir = (from, to, filter = () => true) => {
  fs.cpSync(from, to, { recursive: true, filter: (source) => filter(source) });
};

// package.json de PRODUCCIÓN: solo dependencias de ejecución. El build ya
// viene hecho (dist/ y public/), así que "build" es un no-op: el hosting no
// tiene que compilar TypeScript (ni instalar devDependencies para eso).
const writeProductionPackageJson = () => {
  const source = JSON.parse(fs.readFileSync(path.join(BACKEND_ROOT, "package.json"), "utf8"));
  const productionPackage = {
    name: "grulla",
    version: source.version,
    private: true,
    description: "Vanys — sistema de cotizaciones (API + frontend en una sola app)",
    main: "dist/index.js",
    engines: source.engines,
    scripts: {
      start: "node dist/index.js",
      build: "node -e \"console.log('El build ya viene incluido en el paquete (dist/ y public/).')\"",
    },
    dependencies: source.dependencies,
  };
  fs.writeFileSync(path.join(STAGE_DIR, "package.json"), `${JSON.stringify(productionPackage, null, 2)}\n`);
};

const waitForHealth = (port) =>
  new Promise((resolve, reject) => {
    const deadline = Date.now() + SMOKE_TIMEOUT_MS;
    const attempt = () => {
      http
        .get({ host: "127.0.0.1", port, path: "/api/health" }, (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => (res.statusCode === 200 ? resolve(body) : retry(`HTTP ${res.statusCode}: ${body}`)));
        })
        .on("error", (error) => retry(error.message));
    };
    const retry = (reason) => {
      if (Date.now() > deadline) return reject(new Error(`el paquete no respondió /api/health a tiempo (${reason})`));
      setTimeout(attempt, 500);
    };
    attempt();
  });

const fetchStatus = (port, urlPath) =>
  new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port, path: urlPath, headers: { Accept: "text/html" } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      })
      .on("error", reject);
  });

// Instala el paquete EXACTAMENTE como lo hará el hosting (solo producción)
// y lo arranca: detecta dependencias faltantes, rutas rotas o un frontend
// que no se sirve, antes de subir nada.
const smokeTestPackage = async () => {
  run("npm ci --omit=dev --no-audit --no-fund", STAGE_DIR);

  const child = spawn(process.execPath, ["dist/index.js"], {
    cwd: STAGE_DIR,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(SMOKE_PORT),
      SECRET_HIDDEN_KEY: crypto.randomBytes(32).toString("hex"),
      CRON_SECRET: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));

  try {
    await waitForHealth(SMOKE_PORT);
    const home = await fetchStatus(SMOKE_PORT, "/");
    const deepLink = await fetchStatus(SMOKE_PORT, "/cotizaciones");
    const missingAsset = await fetchStatus(SMOKE_PORT, "/assets/no-existe.js");
    if (home !== 200 || deepLink !== 200) throw new Error(`frontend no servido (/ -> ${home}, /cotizaciones -> ${deepLink})`);
    if (missingAsset !== 404) throw new Error(`un asset inexistente debería dar 404 (dio ${missingAsset})`);
    console.log("  ✔ El paquete arranca en modo producción, la base responde y el frontend se sirve.");
  } catch (error) {
    console.error(output);
    throw error;
  } finally {
    child.kill();
  }
};

const renderEnvFile = ({ jwtSecret, cronSecret }) =>
  [
    "# =====================================================================",
    "# Variables de entorno de Vanys en producción",
    "# hPanel > tu app Node.js > Variables de entorno > Importar .env",
    "#",
    "# COMPLETA las 3 marcadas con <...> con los datos de la base que creaste",
    "# en hPanel > Bases de datos. Los secretos ya vienen generados al azar:",
    "# no los compartas ni los subas a ningún repositorio.",
    "# =====================================================================",
    "",
    "NODE_ENV=production",
    "",
    "# Base de datos (hPanel > Bases de datos > Administración de MySQL).",
    "# En Hostinger el host para una app Node.js es 127.0.0.1 (NO \"localhost\").",
    "PROY_BD_HOST=127.0.0.1",
    "PROY_BD_PORT=3306",
    "PROY_BD=<nombre_de_la_base>",
    "PROY_BD_USER=<usuario_de_la_base>",
    "PROY_BD_PASS=<contraseña_de_la_base>",
    "",
    "# Clave con la que se firman las sesiones (mínimo 32 caracteres).",
    "# Si la cambias, todos los usuarios tendrán que volver a iniciar sesión.",
    `SECRET_HIDDEN_KEY=${jwtSecret}`,
    "",
    "# Secreto del cron que vence cotizaciones cada hora (ver la guía, paso 6).",
    `CRON_SECRET=${cronSecret}`,
    "",
    "# Solo si el frontend se publica en OTRO dominio que la API. Con la",
    "# instalación recomendada (todo en la misma app) déjalo vacío.",
    "CORS_ORIGINS=",
    "",
  ].join("\n");

const renderCredentials = ({ adminEmail, adminPassword }) =>
  [
    "GRULLA — ACCESO INICIAL (Super Administrador)",
    "==============================================",
    "",
    `Correo:               ${adminEmail}`,
    `Contraseña temporal:  ${adminPassword}`,
    "",
    "- En el primer ingreso el sistema obliga a cambiar esta contraseña.",
    "- Este acceso es de PLATAFORMA: desde acá se crean las empresas, sus",
    "  tiendas y su primer Administrador.",
    "- Guarda la contraseña definitiva en un gestor de contraseñas y borra",
    "  este archivo cuando termines.",
    "",
  ].join("\n");

async function main() {
  const adminEmail = readArg("--admin-email", "superadmin@grulla.local");
  const adminPassword = generateTemporaryPassword();

  step("Compilando backend (TypeScript -> dist/)");
  fs.rmSync(path.join(BACKEND_ROOT, "dist"), { recursive: true, force: true });
  run("npm run build", BACKEND_ROOT, PRODUCTION_BUILD_ENV);
  assertBackendBuild();

  step("Compilando frontend (Vite, modo producción)");
  run("npm run build", FRONTEND_ROOT, PRODUCTION_BUILD_ENV);
  assertProductionFrontendBundle();

  step("Armando el paquete de la app");
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(STAGE_DIR, { recursive: true });
  copyDir(path.join(BACKEND_ROOT, "dist"), path.join(STAGE_DIR, "dist"), (source) => !source.endsWith(".map"));
  copyDir(path.join(FRONTEND_ROOT, "dist"), path.join(STAGE_DIR, "public"));
  copyDir(path.join(BACKEND_ROOT, "assets"), path.join(STAGE_DIR, "assets"));
  writeProductionPackageJson();
  // Lockfile alineado al package.json de producción (mismas versiones que
  // desarrollo, sin devDependencies): reproducible y válido para `npm ci`.
  fs.copyFileSync(path.join(BACKEND_ROOT, "package-lock.json"), path.join(STAGE_DIR, "package-lock.json"));
  run("npm install --package-lock-only --omit=dev --no-audit --no-fund", STAGE_DIR);

  step("Probando el paquete como lo correrá el hosting");
  await smokeTestPackage();
  fs.rmSync(path.join(STAGE_DIR, "node_modules"), { recursive: true, force: true });

  step("Comprimiendo grulla-app.zip");
  const zipPath = path.join(OUTPUT_DIR, "grulla-app.zip");
  const fileCount = zipDirectory(STAGE_DIR, zipPath);
  // La carpeta intermedia se borra: en salida/ queda solo lo que se sube,
  // para que no haya dudas sobre qué archivo usar.
  fs.rmSync(STAGE_DIR, { recursive: true, force: true });
  console.log(`  ✔ ${fileCount} archivos, ${(fs.statSync(zipPath).size / 1024 / 1024).toFixed(2)} MB`);

  step("Generando grulla_produccion.sql (esquema + catálogo + Super Administrador)");
  const { sql, rowCounts, verification } = await buildProductionSql({ adminEmail, adminPassword });
  fs.writeFileSync(path.join(OUTPUT_DIR, "grulla_produccion.sql"), sql);
  const seededTables = Object.entries(rowCounts).filter(([, count]) => count > 0);
  console.log(`  ✔ ${Object.keys(rowCounts).length} tablas; con datos: ${seededTables.map(([t, n]) => `${t}(${n})`).join(", ")}`);
  console.log(`  ✔ Verificado: carga sin errores en una base limpia (${verification.tables} tablas, ${verification.admins} Super Administrador)`);

  step("Generando variables de entorno y credenciales");
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "variables-entorno.env"),
    renderEnvFile({
      jwtSecret: crypto.randomBytes(48).toString("hex"),
      cronSecret: crypto.randomBytes(32).toString("hex"),
    })
  );
  fs.writeFileSync(path.join(OUTPUT_DIR, "CREDENCIALES-INICIALES.txt"), renderCredentials({ adminEmail, adminPassword }));

  console.log(`\n✅ Listo para publicar. Todo quedó en: ${OUTPUT_DIR}`);
  console.log("   Sigue la guía deploy/GUIA-DESPLIEGUE-HOSTINGER.md");
}

main().catch((error) => {
  console.error(`\n✗ No se generó el paquete: ${error.message}`);
  process.exit(1);
});

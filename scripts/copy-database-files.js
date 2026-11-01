"use strict";

/**
 * Paso final de `npm run build`: copia a dist/database/ los .js de
 * migraciones y seeders (y su helper compartido), que tsc no emite porque no
 * son TypeScript. Los necesita src/database/autoMigrate.ts, que actualiza la
 * base al arrancar el servidor en producción.
 */

const fs = require("fs");
const path = require("path");

const SOURCE_DIR = path.resolve(__dirname, "..", "src", "database");
const TARGET_DIR = path.resolve(__dirname, "..", "dist", "database");
const ENTRIES = ["migrations", "seeders", "migration-helpers.js"];

for (const entry of ENTRIES) {
  const target = path.join(TARGET_DIR, entry);
  // Se borra antes de copiar: una migración renombrada o eliminada en src/
  // no debe quedar viva en dist/.
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(path.join(SOURCE_DIR, entry), target, { recursive: true });
}

console.log(`Migraciones y seeders copiados a ${path.relative(process.cwd(), TARGET_DIR)}`);

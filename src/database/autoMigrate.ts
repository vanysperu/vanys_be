import fs from "fs";
import path from "path";
import { QueryInterface, QueryTypes, Sequelize } from "sequelize";
import { DataBase } from ".";
import { isProduction } from "../config/runtime";

// Aplica al ARRANCAR las migraciones y seeders que la base todavía no tiene
// (pedido explícito del usuario: no tener que correr
// `npm run db:upgrade-production` a mano después de cada versión). Hace lo
// mismo que ese script, pero desde el propio servidor:
//   - lee SequelizeMeta/SequelizeData (las tablas de registro de
//     sequelize-cli) y aplica solo lo que falta, en orden de nombre;
//   - cada archivo se anota en su tabla de registro apenas termina, igual
//     que sequelize-cli, así un reinicio a mitad de camino retoma desde ahí;
//   - si no hay registro de seeders, NO aplica nada: sin él correrían todos,
//     incluidos los que siembran empresas y usuarios de ejemplo.
//
// Los archivos son los mismos .js de src/database/{migrations,seeders} que
// usa sequelize-cli; `npm run build` los copia a dist/database/ (ver
// scripts/copy-database-files.js), por eso se buscan junto a este archivo.
const MIGRATIONS_DIR = path.join(__dirname, "migrations");
const SEEDERS_DIR = path.join(__dirname, "seeders");

// Lock de MySQL: si el hosting levanta dos procesos a la vez (ej. el viejo
// todavía no terminó de apagarse al redesplegar), solo uno migra y el otro
// espera a que termine en vez de aplicar lo mismo dos veces.
const LOCK_NAME = "vanys_auto_migrate";
const LOCK_TIMEOUT_SECONDS = 120;

interface MigrationModule {
  up: (queryInterface: QueryInterface, sequelize: typeof Sequelize) => Promise<unknown>;
}

interface TrackingTable {
  label: string;
  canonical: "SequelizeMeta" | "SequelizeData";
  dir: string;
}

const TRACKING_TABLES: TrackingTable[] = [
  { label: "migración", canonical: "SequelizeMeta", dir: MIGRATIONS_DIR },
  { label: "seeder", canonical: "SequelizeData", dir: SEEDERS_DIR },
];

// Producción: activo por defecto. Desarrollo: apagado (ahí se usa
// sequelize-cli como siempre), salvo DB_AUTO_MIGRATE=true. En cualquier
// entorno se puede forzar con DB_AUTO_MIGRATE=true/false.
export function shouldAutoMigrate(): boolean {
  const flag = process.env.DB_AUTO_MIGRATE?.trim().toLowerCase();
  if (flag === "true") return true;
  if (flag === "false") return false;
  return isProduction();
}

const isMigrationModule = (value: unknown): value is MigrationModule =>
  typeof value === "object" && value !== null && "up" in value && typeof value.up === "function";

const loadMigration = (file: string): MigrationModule => {
  // Carga dinámica a propósito: son los .js de sequelize-cli, no módulos TS.
  const loaded: unknown = require(file);
  if (!isMigrationModule(loaded)) throw new Error(`${path.basename(file)} no exporta una función up()`);
  return loaded;
};

const listFiles = (dir: string): string[] => {
  if (!fs.existsSync(dir)) throw new Error(`No se encontró la carpeta ${dir} (¿se corrió npm run build?)`);
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".js"))
    .sort();
};

// Nombre real de la tabla de registro: un .sql viejo generado en Windows pudo
// dejarla en minúscula ("sequelizemeta"); se usa tal como esté.
const findTableName = async (sequelize: Sequelize, canonical: string): Promise<string | null> => {
  const rows = await sequelize.query<{ name: string }>(
    "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = ?",
    { replacements: [canonical.toLowerCase()], type: QueryTypes.SELECT }
  );
  return rows[0]?.name ?? null;
};

const readApplied = async (sequelize: Sequelize, table: string): Promise<Set<string>> => {
  const rows = await sequelize.query<{ name: string }>(`SELECT name FROM \`${table}\``, { type: QueryTypes.SELECT });
  return new Set(rows.map((row) => row.name));
};

const resolvePending = async (sequelize: Sequelize, tracking: TrackingTable) => {
  const table = await findTableName(sequelize, tracking.canonical);
  if (!table) {
    throw new Error(
      `La base no tiene la tabla ${tracking.canonical}. En una instalación nueva primero se importa grulla_produccion.sql (ver la guía de despliegue).`
    );
  }
  const applied = await readApplied(sequelize, table);
  if (applied.size === 0) {
    throw new Error(`${table} está vacía: no se puede saber qué ya se aplicó. No se aplica nada.`);
  }
  const pending = listFiles(tracking.dir).filter((file) => !applied.has(file));
  return { table, pending };
};

const applyPending = async (sequelize: Sequelize, tracking: TrackingTable): Promise<number> => {
  const { table, pending } = await resolvePending(sequelize, tracking);

  for (const file of pending) {
    console.log(`[db] Aplicando ${tracking.label} ${file}`);
    await loadMigration(path.join(tracking.dir, file)).up(sequelize.getQueryInterface(), Sequelize);
    await sequelize.query(`INSERT INTO \`${table}\` (name) VALUES (?)`, { replacements: [file] });
  }
  return pending.length;
};

export async function runPendingMigrations(): Promise<void> {
  const { sequelize } = DataBase.instance;

  // La transacción solo fija UNA conexión del pool para sostener el lock
  // (GET_LOCK es por conexión); las migraciones corren por las demás.
  await sequelize.transaction(async (transaction) => {
    const [lock] = await sequelize.query<{ acquired: number | null }>("SELECT GET_LOCK(?, ?) AS acquired", {
      replacements: [LOCK_NAME, LOCK_TIMEOUT_SECONDS],
      type: QueryTypes.SELECT,
      transaction,
    });
    if (lock?.acquired !== 1) throw new Error("Otro proceso está actualizando la base y no terminó a tiempo");

    try {
      // Migraciones primero: los seeders nuevos pueden usar columnas nuevas.
      let total = 0;
      for (const tracking of TRACKING_TABLES) {
        total += await applyPending(sequelize, tracking);
      }
      console.log(total > 0 ? `[db] Base actualizada (${total} cambio(s) aplicado(s))` : "[db] La base ya está al día");
    } finally {
      await sequelize.query("SELECT RELEASE_LOCK(?)", { replacements: [LOCK_NAME], transaction });
    }
  });
}

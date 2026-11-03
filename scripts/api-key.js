"use strict";

/**
 * Gestión de API keys de integración (ej. la web pública de una empresa que
 * envía pedidos a POST /api/public/quotation-request). Ver
 * src/api/modules/web_quote_request/README.md.
 *
 * La key se muestra UNA sola vez al crearla: en la base solo queda su
 * SHA-256 y un prefijo para reconocerla. Si se pierde, se revoca y se crea
 * otra.
 *
 * Uso (desde grulla_be/):
 *   npm run api-key -- create --company <id> --name "Web principal" [--business-unit <id>] [--issued-by <userId>]
 *   npm run api-key -- list [--company <id>]
 *   npm run api-key -- revoke --id <apiKeyId> [--issued-by <userId>]
 *
 * --issued-by: usuario que emite/revoca la key (queda en la auditoría y como
 * autor de los avisos que genere la integración). Si no se indica, se usa el
 * Super Administrador activo más antiguo.
 */

require("dotenv").config();
const crypto = require("crypto");
const mysql = require("mysql2/promise");

// Debe coincidir EXACTAMENTE con
// src/api/modules/api_key/services/shared/api_key_hash.ts.
const API_KEY_PREFIX = "vnk_";
const generateApiKey = () => `${API_KEY_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
const hashApiKey = (plainKey) => crypto.createHash("sha256").update(plainKey).digest("hex");
const displayPrefix = (plainKey) => plainKey.slice(0, 12);

const parseArgs = (argv) => {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    if (!flag || !flag.startsWith("--")) throw new Error(`Argumento inesperado: ${flag}`);
    options[flag.slice(2)] = rest[index + 1];
  }
  return { command, options };
};

const toPositiveInt = (value, label) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${label} debe ser un id numérico`);
  return number;
};

const getConnection = () =>
  mysql.createConnection({
    host: process.env.PROY_BD_HOST,
    port: Number(process.env.PROY_BD_PORT),
    user: process.env.PROY_BD_USER,
    password: process.env.PROY_BD_PASS,
    database: process.env.PROY_BD,
  });

// Usuario activo que firma la operación: el indicado, o el Super
// Administrador activo más antiguo.
const resolveIssuer = async (connection, issuedBy) => {
  if (issuedBy) {
    const id = toPositiveInt(issuedBy, "--issued-by");
    const [rows] = await connection.query(
      "SELECT id FROM `user` WHERE id = ? AND is_deleted = false AND status = true",
      [id]
    );
    if (rows.length === 0) throw new Error(`El usuario ${id} no existe o está inactivo`);
    return id;
  }

  const [rows] = await connection.query(
    `SELECT u.id FROM \`user\` u
     INNER JOIN user_role ur ON ur.user_id = u.id
     INNER JOIN role r ON r.id = ur.role_id AND r.is_system = true AND r.status = true
     WHERE u.is_deleted = false AND u.status = true
     ORDER BY u.id ASC LIMIT 1`
  );
  if (rows.length === 0) throw new Error("No hay un Super Administrador activo: indica --issued-by <userId>");
  return rows[0].id;
};

const createKey = async (connection, options) => {
  const companyId = toPositiveInt(options.company, "--company");
  const name = (options.name ?? "").trim();
  if (!name || name.length > 100) throw new Error("--name es obligatorio (máximo 100 caracteres)");

  const [companies] = await connection.query(
    "SELECT id, business_name FROM company WHERE id = ? AND is_deleted = false",
    [companyId]
  );
  if (companies.length === 0) throw new Error(`La empresa ${companyId} no existe o está deshabilitada`);

  const businessUnitId = options["business-unit"] ? toPositiveInt(options["business-unit"], "--business-unit") : null;
  if (businessUnitId) {
    const [units] = await connection.query(
      "SELECT id FROM business_unit WHERE id = ? AND company_id = ? AND is_deleted = false",
      [businessUnitId, companyId]
    );
    if (units.length === 0) throw new Error(`La tienda ${businessUnitId} no existe, está deshabilitada o es de otra empresa`);
  }

  const issuer = await resolveIssuer(connection, options["issued-by"]);
  const plainKey = generateApiKey();
  const now = new Date();
  const [result] = await connection.query(
    `INSERT INTO api_key (company_id, business_unit_id, name, key_prefix, key_hash, last_used_at, is_deleted,
                          created_by, created_at, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, false, ?, ?, ?, ?)`,
    [companyId, businessUnitId, name, displayPrefix(plainKey), hashApiKey(plainKey), issuer, now, issuer, now]
  );

  console.log(`API key creada (id ${result.insertId}) para "${companies[0].business_name}".`);
  console.log("Guárdala ahora: no se vuelve a mostrar.\n");
  console.log(`  X-Api-Key: ${plainKey}\n`);
};

const listKeys = async (connection, options) => {
  const companyId = options.company ? toPositiveInt(options.company, "--company") : null;
  const [rows] = await connection.query(
    `SELECT ak.id, ak.company_id, c.business_name, ak.business_unit_id, ak.name, ak.key_prefix,
            ak.last_used_at, ak.is_deleted, ak.created_at
     FROM api_key ak
     INNER JOIN company c ON c.id = ak.company_id
     WHERE (? IS NULL OR ak.company_id = ?)
     ORDER BY ak.company_id, ak.id
     LIMIT 200`,
    [companyId, companyId]
  );
  if (rows.length === 0) return console.log("No hay API keys.");

  console.table(
    rows.map((row) => ({
      id: row.id,
      empresa: `${row.company_id} - ${row.business_name}`,
      tienda: row.business_unit_id ?? "-",
      nombre: row.name,
      prefijo: `${row.key_prefix}…`,
      estado: row.is_deleted ? "revocada" : "activa",
      ultimo_uso: row.last_used_at ? new Date(row.last_used_at).toISOString() : "-",
    }))
  );
};

const revokeKey = async (connection, options) => {
  const id = toPositiveInt(options.id, "--id");
  const issuer = await resolveIssuer(connection, options["issued-by"]);
  // Soft-delete: la fila queda para la auditoría; la key deja de autenticar
  // al instante.
  const [result] = await connection.query(
    "UPDATE api_key SET is_deleted = true, updated_by = ?, updated_at = ? WHERE id = ? AND is_deleted = false",
    [issuer, new Date(), id]
  );
  if (result.affectedRows === 0) throw new Error(`La API key ${id} no existe o ya estaba revocada`);
  console.log(`API key ${id} revocada.`);
};

const COMMANDS = { create: createKey, list: listKeys, revoke: revokeKey };

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  const run = COMMANDS[command];
  if (!run) throw new Error("Comando inválido. Usa: create | list | revoke (ver la cabecera de scripts/api-key.js)");

  const connection = await getConnection();
  try {
    await run(connection, options);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});

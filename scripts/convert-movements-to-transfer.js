"use strict";

/**
 * Convierte movimientos manuales de Caja que en realidad fueron una
 * TRANSFERENCIA entre cuentas propias (un egreso de una cuenta + un ingreso a
 * otra) en transferencias de verdad (tabla cash_transfer). Ver
 * src/api/modules/cash_transfer/README.md.
 *
 * Por qué: registrados como egreso + ingreso, el saldo de cada cuenta queda
 * bien, pero los ingresos y egresos de la empresa (Caja, Estadísticas,
 * resultado del mes) se inflan por el doble del monto. Convertidos, los
 * saldos por cuenta NO cambian y los totales dejan de estar inflados.
 *
 * Qué hace, en UNA transacción (si algo falla, no queda nada a medias):
 *   1. Bloquea los movimientos y valida: misma empresa, manuales, vigentes,
 *      salidas = egresos de UNA cuenta, entradas = ingresos de OTRA cuenta,
 *      y que las sumas coincidan.
 *   2. Valida el cierre de caja: ninguna fecha (vieja ni nueva) en un mes cerrado.
 *   3. Anula los movimientos (is_deleted = 1, igual que el botón de Caja) con
 *      una fila en `log` cada uno.
 *   4. Crea la(s) transferencia(s) con su fila en `log`.
 * Nunca borra nada: los movimientos quedan anulados (y se pueden reactivar).
 *
 * Por defecto SOLO MUESTRA lo que haría. Con --apply escribe.
 *
 * Uso (desde grulla_be/):
 *   node scripts/convert-movements-to-transfer.js --out 6 --in 7 --by 8 \
 *        --reason "Era un traspaso de BEQ a BCP" [--date 2026-11-09] [--description "..."] [--apply]
 *
 *   --out   ids de los egresos manuales (separados por coma) — de dónde salió
 *   --in    ids de los ingresos manuales (separados por coma) — a dónde entró
 *           Uno de los dos lados tiene que tener un solo movimiento: se crea
 *           una transferencia por cada movimiento del otro lado.
 *   --by    id del usuario que hace la corrección (auditoría)
 *   --reason motivo (5–500 caracteres), queda en el log
 *   --date  fecha de la transferencia (AAAA-MM-DD). Obligatoria si los
 *           movimientos tienen fechas distintas.
 *
 * Toma la conexión del .env (PROY_BD*), igual que el backend: revisar a qué
 * base apunta antes de usar --apply.
 */

require("dotenv").config();
const mysql = require("mysql2/promise");

const CASH_ACCOUNT_NAME = "Efectivo";
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const parseArgs = (argv) => {
  const options = { apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--apply") {
      options.apply = true;
      continue;
    }
    if (!flag.startsWith("--")) throw new Error(`Argumento inesperado: ${flag}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Falta el valor de ${flag}`);
    options[flag.slice(2)] = value;
    index += 1;
  }
  return options;
};

const toIds = (value, label) => {
  if (!value) throw new Error(`Falta --${label}`);
  const ids = String(value)
    .split(",")
    .map((part) => Number(part.trim()));
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) throw new Error(`--${label}: ids numéricos separados por coma`);
  return [...new Set(ids)];
};

const toCents = (amount) => Math.round(Number(amount) * 100);
const fromCents = (cents) => cents / 100;
const money = (cents) => `S/ ${fromCents(cents).toFixed(2)}`;
const dateOnly = (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10));
const accountName = (id, name) => (id === null ? CASH_ACCOUNT_NAME : name || `Cuenta #${id}`);

const fail = (message) => {
  throw new Error(message);
};

// Mes cerrado del libro de caja que contiene `date` (o null).
const closedPeriodOf = async (connection, companyId, date) => {
  const [[ledger]] = await connection.query("SELECT start_date FROM cash_ledger WHERE company_id = ? LOCK IN SHARE MODE", [companyId]);
  if (!ledger) return null;
  if (date < dateOnly(ledger.start_date)) return null;
  const period = date.slice(0, 7);
  const [[row]] = await connection.query(
    "SELECT status FROM cash_period WHERE company_id = ? AND period = ? LOCK IN SHARE MODE",
    [companyId, period]
  );
  return row && row.status === "closed" ? period : null;
};

const sameValue = (rows, pick) => new Set(rows.map(pick)).size === 1;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outIds = toIds(options.out, "out");
  const inIds = toIds(options.in, "in");
  const actorId = Number(options.by);
  if (!Number.isInteger(actorId) || actorId <= 0) fail("Falta --by (id del usuario que hace la corrección)");
  const reason = String(options.reason ?? "").trim();
  if (reason.length < 5 || reason.length > 500) fail("--reason debe tener entre 5 y 500 caracteres");
  if (options.date && !DATE_ONLY.test(options.date)) fail("--date debe ser AAAA-MM-DD");
  if (outIds.some((id) => inIds.includes(id))) fail("Un mismo movimiento no puede ser salida y entrada");
  if (outIds.length > 1 && inIds.length > 1) fail("Uno de los dos lados (--out o --in) tiene que tener un solo movimiento");

  const connection = await mysql.createConnection({
    host: process.env.PROY_BD_HOST,
    port: Number(process.env.PROY_BD_PORT),
    user: process.env.PROY_BD_USER,
    password: process.env.PROY_BD_PASS,
    database: process.env.PROY_BD,
    // Auditoría en UTC, igual que el backend (Sequelize guarda en +00:00); sin
    // esto mysql2 escribe la hora local de la máquina. Los DATE se leen como
    // texto (día calendario, sin zona).
    timezone: "Z",
    dateStrings: ["DATE"],
  });
  console.log(`Base: ${process.env.PROY_BD} @ ${process.env.PROY_BD_HOST}  —  modo: ${options.apply ? "APLICAR" : "SIMULACIÓN (sin --apply no se escribe nada)"}\n`);

  try {
    await connection.beginTransaction();

    const [[actor]] = await connection.query("SELECT id FROM user WHERE id = ?", [actorId]);
    if (!actor) fail(`El usuario --by ${actorId} no existe`);

    const allIds = [...outIds, ...inIds];
    const [rows] = await connection.query(
      `SELECT cm.id, cm.company_id, cm.business_unit_id, cm.direction, cm.amount, cm.occurred_at, cm.description,
              cm.payment_account_id, cm.operation_number, cm.is_deleted, pa.name AS account_name
       FROM cash_movement cm LEFT JOIN general_variable pa ON pa.id = cm.payment_account_id
       WHERE cm.id IN (?) FOR UPDATE`,
      [allIds]
    );
    const byId = new Map(rows.map((row) => [Number(row.id), row]));
    const missing = allIds.filter((id) => !byId.has(id));
    if (missing.length > 0) fail(`No existen los movimientos: ${missing.join(", ")}`);

    const outs = outIds.map((id) => byId.get(id));
    const ins = inIds.map((id) => byId.get(id));
    const all = [...outs, ...ins];

    if (!sameValue(all, (row) => Number(row.company_id))) fail("Los movimientos son de empresas distintas");
    const annulled = all.filter((row) => Number(row.is_deleted) === 1);
    if (annulled.length > 0) fail(`Movimientos ya anulados: ${annulled.map((row) => row.id).join(", ")}`);
    const wrongOut = outs.filter((row) => row.direction !== "expense");
    if (wrongOut.length > 0) fail(`--out tiene que ser egresos: ${wrongOut.map((row) => row.id).join(", ")} no lo son`);
    const wrongIn = ins.filter((row) => row.direction !== "income");
    if (wrongIn.length > 0) fail(`--in tiene que ser ingresos: ${wrongIn.map((row) => row.id).join(", ")} no lo son`);

    const accountOf = (row) => (row.payment_account_id === null ? null : Number(row.payment_account_id));
    if (!sameValue(outs, accountOf)) fail("Las salidas (--out) salieron de cuentas distintas");
    if (!sameValue(ins, accountOf)) fail("Las entradas (--in) entraron a cuentas distintas");
    const fromId = accountOf(outs[0]);
    const toId = accountOf(ins[0]);
    if (fromId === toId) fail("La cuenta de salida y la de entrada son la misma: no es una transferencia");

    const outCents = outs.reduce((sum, row) => sum + toCents(row.amount), 0);
    const inCents = ins.reduce((sum, row) => sum + toCents(row.amount), 0);
    if (outCents !== inCents) fail(`No cuadra: salió ${money(outCents)} y entró ${money(inCents)}`);

    const dates = [...new Set(all.map((row) => dateOnly(row.occurred_at)))];
    if (!options.date && dates.length > 1) {
      fail(`Los movimientos tienen fechas distintas (${dates.join(", ")}): indica la fecha de la transferencia con --date`);
    }
    const transferDate = options.date ?? dates[0];

    const companyId = Number(outs[0].company_id);
    for (const date of new Set([...dates, transferDate])) {
      const closed = await closedPeriodOf(connection, companyId, date);
      if (closed) fail(`El mes ${closed} está cerrado en la caja: reábrelo antes de convertir (fecha ${date})`);
    }

    // Una transferencia por cada movimiento del lado que tiene varios.
    const splitSide = outs.length > 1 ? outs : ins;
    const transfers = splitSide.map((row) => ({ cents: toCents(row.amount), operation: row.operation_number }));
    const businessUnitId = sameValue(all, (row) => row.business_unit_id) ? all[0].business_unit_id : null;
    const description =
      (options.description ?? all.map((row) => (row.description ?? "").trim()).filter(Boolean).join(" / ")).slice(0, 500) || null;
    const fromName = accountName(fromId, outs[0].account_name);
    const toName = accountName(toId, ins[0].account_name);

    console.log("Movimientos que se ANULAN:");
    for (const row of all) {
      const sign = row.direction === "income" ? "+" : "-";
      console.log(
        `  #${row.id}  ${dateOnly(row.occurred_at)}  ${sign}${money(toCents(row.amount))}  ${accountName(accountOf(row), row.account_name)}  ${row.description ?? ""}`
      );
    }
    console.log(`\nTransferencias que se CREAN (fecha ${transferDate}, tienda ${businessUnitId ?? "—"}):`);
    for (const transfer of transfers) console.log(`  ${money(transfer.cents)}  ${fromName} → ${toName}`);
    console.log(`\nEfecto: saldos por cuenta SIN CAMBIOS. Ingresos y egresos de la empresa bajan ${money(outCents)} cada uno.`);

    if (!options.apply) {
      await connection.rollback();
      console.log("\nSimulación: no se escribió nada. Repite con --apply para aplicar.");
      return;
    }

    const now = new Date();
    const createdTransferIds = [];
    for (const transfer of transfers) {
      const [result] = await connection.query(
        `INSERT INTO cash_transfer
           (company_id, business_unit_id, from_payment_account_id, to_payment_account_id, amount, occurred_at,
            description, operation_number, is_deleted, created_by, created_at, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
        [companyId, businessUnitId, fromId, toId, fromCents(transfer.cents), transferDate, description,
          transfer.operation ?? null, actorId, now, actorId, now]
      );
      createdTransferIds.push(result.insertId);
      await connection.query(
        "INSERT INTO log (user_id, action, module, description, company_id, created_at) VALUES (?, 'CREATE', 'cash_transfer', ?, ?, ?)",
        [actorId, `Registró la transferencia #${result.insertId}: ${money(transfer.cents)} de ${fromName} a ${toName} (${transferDate}). Convertida desde los movimientos #${allIds.join(", #")}. Motivo: ${reason}`, companyId, now]
      );
    }

    await connection.query("UPDATE cash_movement SET is_deleted = 1, updated_by = ?, updated_at = ? WHERE id IN (?)", [actorId, now, allIds]);
    for (const row of all) {
      const kind = row.direction === "income" ? "ingreso" : "egreso";
      await connection.query(
        "INSERT INTO log (user_id, action, module, description, company_id, created_at) VALUES (?, 'DISABLE', 'cash_movement', ?, ?, ?)",
        [actorId, `Anuló el ${kind} de ${money(toCents(row.amount))} (movimiento #${row.id}): era una transferencia entre cuentas, convertida en la transferencia #${createdTransferIds.join(", #")}. Motivo: ${reason}`, companyId, now]
      );
    }

    await connection.commit();
    console.log(`\nAplicado. Transferencias creadas: #${createdTransferIds.join(", #")}.`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
});

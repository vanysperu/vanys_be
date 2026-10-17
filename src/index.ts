// Debe ser el PRIMER import: carga .env y fija la zona horaria del negocio
// antes de que cualquier otro módulo lea process.env o formatee una fecha.
import "./config/bootstrap";
import { assertProductionEnv } from "./config/validateEnv";
import { resolvePort } from "./config/runtime";
import Server from "./server/index.server";
import { DataBase } from "./database";
import { expireOverdueQuotations } from "./api/modules/quotation/services/jobs/expireQuotations.job";
import { formatInstantDateTimeEsPe } from "./utils/dateUtils";

assertProductionEnv();

export const server = Server.init(resolvePort());

process.setMaxListeners(0);

// Job liviano en memoria: no hay cola/worker (bullmq, etc.) todavía en este
// proyecto para justificar esa infraestructura por un solo job — si en el
// futuro se agregan más jobs recurrentes, migrar esto a bullmq (CLAUDE.md
// sección 8). Corre al arrancar y luego cada hora. Como también corre al
// arrancar, si el hosting reinicia o "despierta" el proceso, se pone al día
// solo con lo que haya vencido mientras estuvo detenido.
const EXPIRE_QUOTATIONS_INTERVAL_MS = 60 * 60 * 1000;

const runExpireQuotationsJob = () => {
  expireOverdueQuotations()
    .then((count) => {
      if (count > 0) console.log(`[jobs] ${count} cotización(es) marcada(s) como vencida(s)`);
    })
    .catch((error) => console.error("[jobs] Error al vencer cotizaciones:", error));
};

let expireJobTimer: NodeJS.Timeout | null = null;

server.start(() => {
  console.log(`Servidor escuchando en el puerto ${resolvePort()} (${process.env.NODE_ENV ?? "development"})`);
  DataBase.instance;
  console.log(`Hora del negocio (America/Lima): ${formatInstantDateTimeEsPe(new Date())}`);

  runExpireQuotationsJob();
  expireJobTimer = setInterval(runExpireQuotationsJob, EXPIRE_QUOTATIONS_INTERVAL_MS);
});

// El hosting detiene/reinicia el proceso con SIGTERM (al redesplegar, al
// reiniciar desde el panel). Se termina lo que está en curso y se cierran
// las conexiones a MySQL en vez de cortarlas en seco — en un hosting
// compartido el límite de conexiones por usuario es bajo, y conexiones
// "colgadas" pueden bloquear el arranque siguiente.
const SHUTDOWN_TIMEOUT_MS = 10_000;
let shuttingDown = false;

const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[${signal}] Cerrando el servidor...`);

  if (expireJobTimer) clearInterval(expireJobTimer);
  const forceExit = setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    await server.stop();
    await DataBase.instance.sequelize.close();
  } finally {
    process.exit(0);
  }
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

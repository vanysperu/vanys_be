import { Op, WhereOptions } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { openSecret } from "../../../../../core/security/secretBox";
import { EmailOutboxAttributes, EmailOutboxModel } from "../../model/email_outbox.model";
import { EmailPayloadByTemplate, EmailTemplateName } from "../../types/email.types";
import { EmailPermanentError, EmailProvider, EmailQuotaExceededError } from "../providers/email_provider";
import { resolveEmailProvider } from "../providers/resolve_provider";
import { isKnownTemplate, renderEmail } from "../templates/render";
import { hasQuotaFor, markQuotaExhaustedByProvider, nextQuotaWindow, recordEmailSent } from "./daily_usage.service";

// Envío de la cola. Lo llaman: el aviso inmediato al encolar, un timer cada
// minuto y el cron del hosting (POST /internal/jobs/tick), porque en Hostinger
// la app se apaga sin tráfico.
const BATCH_SIZE = 20;
// Mientras un correo está "sending", nadie más lo toma; si el proceso muere a
// mitad, vuelve a estar disponible cuando vence la reserva.
const LEASE_MINUTES = 5;
const MAX_ATTEMPTS = 5;
// Espera antes de cada reintento (minutos): 1, 5, 15, 60.
const BACKOFF_MINUTES = [1, 5, 15, 60];
const NOT_CONFIGURED = "El correo no está configurado en el servidor (EMAIL_PROVIDER)";

export interface DispatchResult {
  sent: number;
  failed: number;
  deferred: number;
}

const addMinutes = (minutes: number): Date => new Date(nowUtc().getTime() + minutes * 60_000);

// Vencidos: pendientes cuyo turno llegó, o "sending" con la reserva vencida.
const dueCondition = (now: Date): WhereOptions<EmailOutboxAttributes> => ({
  [Op.or]: [
    { status: "pending", [Op.or]: [{ next_attempt_at: null }, { next_attempt_at: { [Op.lte]: now } }] },
    { status: "sending", next_attempt_at: { [Op.lte]: now } },
  ],
});

// Toma un correo para enviarlo; false si otro proceso se lo ganó.
const claim = async (id: number): Promise<boolean> => {
  const now = nowUtc();
  const [affected] = await DataBase.instance.email_outbox.update(
    { status: "sending", next_attempt_at: addMinutes(LEASE_MINUTES), updated_at: now },
    { where: { [Op.and]: [{ id }, dueCondition(now)] } }
  );
  return affected === 1;
};

const update = (id: number, values: Partial<EmailOutboxAttributes>) =>
  DataBase.instance.email_outbox.update({ ...values, updated_at: nowUtc() }, { where: { id } });

// Fallo definitivo: se borra el contenido (puede llevar un enlace vigente).
const markFailed = (row: EmailOutboxModel, error: string) =>
  update(row.id, {
    status: "failed",
    attempts: row.attempts + 1,
    next_attempt_at: null,
    payload_encrypted: null,
    last_error: error.slice(0, 500),
  });

// Sin cupo: vuelve a la cola para cuando se renueve (no cuenta como intento).
const deferToNextWindow = (row: EmailOutboxModel, reason: string) =>
  update(row.id, { status: "pending", next_attempt_at: nextQuotaWindow(), last_error: reason.slice(0, 500) });

const retryLater = (row: EmailOutboxModel, error: string) => {
  const attempts = row.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) return markFailed(row, error);
  const wait = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)] ?? 60;
  return update(row.id, { status: "pending", attempts, next_attempt_at: addMinutes(wait), last_error: error.slice(0, 500) });
};

const readPayload = <T extends EmailTemplateName>(row: EmailOutboxModel): EmailPayloadByTemplate[T] | null => {
  if (!row.payload_encrypted) return null;
  return JSON.parse(openSecret(row.payload_encrypted)) as EmailPayloadByTemplate[T];
};

type Outcome = "sent" | "failed" | "deferred";

async function processOne(row: EmailOutboxModel, provider: EmailProvider | null): Promise<Outcome> {
  if (!provider) {
    await markFailed(row, NOT_CONFIGURED);
    return "failed";
  }
  if (!(await hasQuotaFor(row.category))) {
    await deferToNextWindow(row, "Sin cupo diario de correos: sale cuando se renueve");
    return "deferred";
  }
  if (!isKnownTemplate(row.template)) {
    await markFailed(row, `Plantilla desconocida: ${row.template}`);
    return "failed";
  }

  const payload = readPayload(row);
  if (!payload) {
    await markFailed(row, "El correo no tiene contenido para enviar");
    return "failed";
  }

  try {
    const rendered = await renderEmail(row.template, payload);
    const result = await provider.send({
      to: row.to_email,
      cc: row.cc_email,
      replyTo: row.reply_to,
      subject: row.subject,
      html: rendered.html,
      text: rendered.text,
      attachments: rendered.attachments ?? [],
    });
    await update(row.id, {
      status: "sent",
      attempts: row.attempts + 1,
      sent_at: nowUtc(),
      next_attempt_at: null,
      provider: provider.name,
      provider_message_id: result.providerMessageId,
      payload_encrypted: null,
      last_error: null,
    });
    await recordEmailSent();
    return "sent";
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconocido al enviar el correo";
    if (error instanceof EmailQuotaExceededError) {
      await markQuotaExhaustedByProvider();
      await deferToNextWindow(row, message);
      return "deferred";
    }
    if (error instanceof EmailPermanentError) {
      await markFailed(row, message);
      return "failed";
    }
    await retryLater(row, message);
    return "deferred";
  }
}

/** Manda los correos vencidos de la cola (de a BATCH_SIZE, primero los de seguridad). */
export async function dispatchPendingEmails(): Promise<DispatchResult> {
  const provider = resolveEmailProvider();
  const candidates = await DataBase.instance.email_outbox.findAll({
    attributes: ["id"],
    where: dueCondition(nowUtc()),
    order: [
      [DataBase.instance.sequelize.literal("FIELD(category, 'security', 'notification', 'quotation')"), "ASC"],
      ["id", "ASC"],
    ],
    limit: BATCH_SIZE,
  });

  const result: DispatchResult = { sent: 0, failed: 0, deferred: 0 };
  for (const candidate of candidates) {
    const id = Number(candidate.id);
    if (!(await claim(id))) continue;
    const row = await DataBase.instance.email_outbox.findByPk(id);
    if (!row) continue;
    const outcome = await processOne(row, provider);
    result[outcome] += 1;
  }
  return result;
}

// Aviso inmediato al encolar: un solo envío en curso a la vez; si llegan más
// avisos mientras corre, se vuelve a correr una vez al terminar.
let running = false;
let rerun = false;

export function scheduleEmailDispatch(): void {
  if (running) {
    rerun = true;
    return;
  }
  running = true;
  setImmediate(async () => {
    try {
      do {
        rerun = false;
        await dispatchPendingEmails();
      } while (rerun);
    } catch (error: unknown) {
      console.error("[email] Error al enviar la cola de correos:", error);
    } finally {
      running = false;
    }
  });
}

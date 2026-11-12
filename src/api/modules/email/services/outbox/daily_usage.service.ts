import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";
import {
  addDaysToDateOnly,
  businessLocalToUtc,
  nowUtc,
  todayInBusinessTz,
} from "../../../../../utils/dateUtils";
import { EmailCategory } from "../../model/email_outbox.model";
import { notifySystemAdmins } from "../../../reminder/services/shared/notify_system_admins";

// Cupo diario del plan de correo, compartido por TODAS las empresas (Brevo
// gratis: 300/día). Se cuenta por día de Lima.
const DEFAULT_DAILY_LIMIT = 300;
// Aviso temprano a los Super Administradores.
const WARNING_RATIO = 0.8;
// 10 % reservado para correos de seguridad (recuperar contraseña e
// invitaciones): un enlace que vence en 30 minutos no puede esperar al día
// siguiente porque las cotizaciones se comieron el cupo.
const SECURITY_RESERVE_RATIO = 0.1;

interface UsageRow {
  sent_count: number | string;
  daily_limit: number | string;
  alert_exhausted_at: Date | null;
}

export const resolveDailyLimit = (): number => {
  const configured = Number(process.env.EMAIL_DAILY_LIMIT);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_DAILY_LIMIT;
};

// Primer minuto útil del día siguiente (hora de Lima), en UTC: ahí se renueva
// el cupo y salen los correos que esperaban.
export const nextQuotaWindow = (): Date => businessLocalToUtc(addDaysToDateOnly(todayInBusinessTz(), 1), "00:05");

const ensureToday = async (): Promise<{ usageDate: string; sent: number; limit: number; exhausted: boolean }> => {
  const usageDate = todayInBusinessTz();
  const limit = resolveDailyLimit();
  const now = nowUtc();
  await DataBase.instance.sequelize.query(
    `INSERT IGNORE INTO email_daily_usage (usage_date, sent_count, daily_limit, created_at, updated_at)
     VALUES (:usageDate, 0, :limit, :now, :now)`,
    { replacements: { usageDate, limit, now } }
  );
  const [row] = (await DataBase.instance.sequelize.query(
    "SELECT sent_count, daily_limit, alert_exhausted_at FROM email_daily_usage WHERE usage_date = :usageDate",
    { type: QueryTypes.SELECT, replacements: { usageDate } }
  )) as UsageRow[];
  return {
    usageDate,
    sent: Number(row?.sent_count ?? 0),
    limit: Number(row?.daily_limit ?? limit),
    exhausted: Boolean(row?.alert_exhausted_at),
  };
};

/** ¿Queda cupo hoy para un correo de esta categoría? */
export async function hasQuotaFor(category: EmailCategory): Promise<boolean> {
  const usage = await ensureToday();
  if (usage.exhausted || usage.sent >= usage.limit) return false;
  if (category === "security") return true;
  return usage.sent < Math.floor(usage.limit * (1 - SECURITY_RESERVE_RATIO));
}

// Marca el aviso solo si todavía no estaba marcado: el UPDATE condicional
// garantiza un único aviso por día aunque dos envíos terminen a la vez.
const alertOnce = async (column: "alert_warning_at" | "alert_exhausted_at", usageDate: string): Promise<boolean> => {
  const now = nowUtc();
  const [affected] = await DataBase.instance.email_daily_usage.update(
    { [column]: now, updated_at: now },
    { where: { usage_date: usageDate, [column]: null } }
  );
  return affected === 1;
};

const notifyWarning = (sent: number, limit: number) =>
  notifySystemAdmins({
    title: "Cupo de correos: 80 % usado",
    message: `Hoy se enviaron ${sent} de ${limit} correos del plan (todas las empresas). Al llegar al 90 % se pausan los correos de cotizaciones para reservar el resto a los enlaces de contraseña.`,
  });

const notifyExhausted = (limit: number) =>
  notifySystemAdmins({
    title: "Se acabó el cupo diario de correos",
    message: `Se usaron los ${limit} correos de hoy. Los pendientes quedan en cola y salen solos cuando se renueve el cupo (mañana). Si pasa seguido, conviene subir de plan en Brevo.`,
  });

/** Suma un envío y avisa a los Super Administradores al 80 % y al agotarse (una vez por día). */
export async function recordEmailSent(): Promise<void> {
  const usageDate = todayInBusinessTz();
  await DataBase.instance.sequelize.query(
    "UPDATE email_daily_usage SET sent_count = sent_count + 1, updated_at = :now WHERE usage_date = :usageDate",
    { replacements: { usageDate, now: nowUtc() } }
  );
  const usage = await ensureToday();
  const reachedWarning = usage.sent >= Math.ceil(usage.limit * WARNING_RATIO);
  if (reachedWarning && (await alertOnce("alert_warning_at", usageDate))) await notifyWarning(usage.sent, usage.limit);
  const reachedLimit = usage.sent >= usage.limit;
  if (reachedLimit && (await alertOnce("alert_exhausted_at", usageDate))) await notifyExhausted(usage.limit);
}

/** El proveedor rechazó un envío por cupo: se da el día por agotado y se avisa (una vez). */
export async function markQuotaExhaustedByProvider(): Promise<void> {
  const usage = await ensureToday();
  if (await alertOnce("alert_exhausted_at", usage.usageDate)) await notifyExhausted(usage.limit);
}

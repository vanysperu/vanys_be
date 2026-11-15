import webpush, { WebPushError } from "web-push";
import { Op } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import type { PushPayload } from "../../types/push_notification.types";
import { readPushConfig } from "./push_config";

// Cuántos envíos a la vez (nunca todos de golpe) y cuánto vive el aviso en el
// servicio de push si el teléfono está apagado: pasado eso ya no sirve.
const BATCH_SIZE = 10;
const TTL_SECONDS = 6 * 60 * 60;

// El servicio de push dice que la suscripción ya no existe (el usuario borró
// la app o revocó el permiso): se apaga para no volver a intentarlo.
const GONE_STATUSES = [404, 410];

const describeError = (error: unknown): string => {
  if (error instanceof WebPushError) return `HTTP ${error.statusCode}: ${String(error.body || error.message)}`.slice(0, 255);
  return (error instanceof Error ? error.message : "Error desconocido").slice(0, 255);
};

export interface PushSendResult {
  attempted: number;
  sent: number;
  failed: number;
}

/**
 * Manda una notificación a los teléfonos de esos usuarios (sus suscripciones
 * activas). Nunca lanza: una notificación que no llega no puede frenar lo que
 * la originó. Sin claves VAPID configuradas, no hace nada.
 */
export async function sendPushToUsers(userIds: number[], payload: PushPayload): Promise<PushSendResult> {
  const empty = { attempted: 0, sent: 0, failed: 0 };
  if (userIds.length === 0 || !readPushConfig()) return empty;

  try {
    const subscriptions = await DataBase.instance.push_subscription.findAll({
      where: { user_id: { [Op.in]: [...new Set(userIds)] }, active: true },
    });
    const body = JSON.stringify(payload);
    let sent = 0;
    for (let start = 0; start < subscriptions.length; start += BATCH_SIZE) {
      const batch = subscriptions.slice(start, start + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (subscription) => {
          try {
            await webpush.sendNotification(
              { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
              body,
              { TTL: TTL_SECONDS, urgency: "high", topic: payload.tag?.slice(0, 32) }
            );
            await subscription.update({ last_sent_at: nowUtc(), last_error: null });
            return true;
          } catch (error: unknown) {
            const gone = error instanceof WebPushError && GONE_STATUSES.includes(error.statusCode);
            await subscription.update({ last_error: describeError(error), ...(gone ? { active: false } : {}) });
            return false;
          }
        })
      );
      sent += results.filter(Boolean).length;
    }
    return { attempted: subscriptions.length, sent, failed: subscriptions.length - sent };
  } catch (error: unknown) {
    console.error("[push] No se pudieron enviar las notificaciones:", error);
    return empty;
  }
}

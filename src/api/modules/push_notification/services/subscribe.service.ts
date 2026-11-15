import { createHash } from "crypto";
import { DataBase } from "../../../../database";
import { AppError } from "../../../../core/errors/AppError";
import { nowUtc } from "../../../../utils/dateUtils";
import { IToken } from "../../../interfaces/IToken.interface";
import type { PushSubscriptionInput } from "../types/push_notification.types";
import { readPushConfig } from "./shared/push_config";

export const endpointHash = (endpoint: string): string => createHash("sha256").update(endpoint).digest("hex");

/**
 * Guarda la suscripción del teléfono para el usuario de la sesión. Si ese
 * teléfono ya estaba suscrito con otro usuario (teléfono compartido, cambio de
 * sesión), pasa a ser del usuario actual: un teléfono avisa solo a quien está
 * usando la app en él.
 */
export async function subscribePushService(user: IToken, input: PushSubscriptionInput, userAgent: string | null): Promise<{ active: true }> {
  if (!readPushConfig()) throw new AppError(409, "Las notificaciones al teléfono no están configuradas en el servidor", undefined, "PUSH_DISABLED");
  const hash = endpointHash(input.endpoint);
  const now = nowUtc();
  const fields = {
    company_id: user.companyId ?? null,
    user_id: user.userId,
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    user_agent: userAgent ? userAgent.slice(0, 255) : null,
    active: true,
    last_error: null,
    updated_by: user.userId,
    updated_at: now,
  };
  const existing = await DataBase.instance.push_subscription.findOne({ where: { endpoint_hash: hash } });
  if (existing) {
    await existing.update(fields);
    return { active: true };
  }
  await DataBase.instance.push_subscription.create({
    id: 0,
    endpoint_hash: hash,
    ...fields,
    last_sent_at: null,
    created_by: user.userId,
    created_at: now,
  });
  return { active: true };
}

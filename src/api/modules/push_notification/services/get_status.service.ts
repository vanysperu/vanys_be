import type { PushStatusDto } from "../types/push_notification.types";
import { readPushConfig } from "./shared/push_config";

// Si el servidor tiene claves VAPID y cuál es la pública (la usa el navegador
// para suscribirse). Sin claves, el frontend no ofrece activar notificaciones.
export const getPushStatusService = (): PushStatusDto => {
  const config = readPushConfig();
  return { enabled: Boolean(config), public_key: config?.publicKey ?? null };
};

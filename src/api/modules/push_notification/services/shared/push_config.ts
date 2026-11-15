import webpush from "web-push";

// Claves VAPID del servidor (Web Push estándar). Se generan UNA vez
// (`npm run push:keys`) y van en las variables de entorno: si cambian, todas
// las suscripciones existentes dejan de servir y cada usuario tiene que volver
// a activar las notificaciones en su teléfono.
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY: el par de claves.
//   VAPID_SUBJECT: contacto para los servicios de push (mailto: o https:).
// Sin estas variables, las notificaciones al teléfono quedan apagadas (el
// resto del sistema funciona igual).
export interface PushConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

const DEFAULT_SUBJECT = "mailto:hola@vanysperu.com";
let configured: string | null = null;

export function readPushConfig(): PushConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  const subject = process.env.VAPID_SUBJECT?.trim() || DEFAULT_SUBJECT;
  // La librería guarda la configuración globalmente: se aplica una sola vez
  // (y de nuevo solo si las variables cambian, ej. en las pruebas).
  const signature = `${publicKey}|${privateKey}|${subject}`;
  if (configured !== signature) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = signature;
  }
  return { publicKey, privateKey, subject };
}

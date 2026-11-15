"use strict";

/**
 * Genera el par de claves VAPID para las notificaciones al teléfono (Web Push).
 * Uso (desde grulla_be/): npm run push:keys
 *
 * Se generan UNA sola vez por entorno y se copian a las variables de entorno.
 * Si se cambian después, todas las suscripciones dejan de servir y cada usuario
 * tiene que volver a activar las notificaciones en su teléfono.
 */
const webpush = require("web-push");

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log("# Notificaciones al teléfono (copiar a las variables de entorno)");
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log("VAPID_SUBJECT=mailto:hola@vanysperu.com");

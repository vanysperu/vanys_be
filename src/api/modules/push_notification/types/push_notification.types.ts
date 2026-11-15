// Lo que recibe el service worker del teléfono (public/sw.js del frontend).
export interface PushPayload {
  title: string;
  body: string;
  // Pantalla que se abre al tocar la notificación (ruta del frontend).
  url: string;
  // Notificaciones con el mismo tag se reemplazan en vez de apilarse.
  tag?: string;
}

// POST /push/subscribe: lo que entrega el navegador (PushSubscription.toJSON()).
export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushStatusDto {
  // false = el servidor no tiene claves VAPID: no se ofrece activar.
  enabled: boolean;
  public_key: string | null;
}

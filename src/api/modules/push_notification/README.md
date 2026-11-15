# Módulo: push_notification (Notificaciones al teléfono)

Pedido del usuario (14-nov-2026): cuando llega un pedido **"Pendiente de cotizar"** desde la web,
avisar al teléfono de quien lo tiene que cotizar, aunque la app esté cerrada. Web Push estándar
(librería `web-push` 3.6.7, aprobada en CLAUDE.md): sin servicios de terceros ni cuentas extra; el
aviso viaja por el servicio push del propio navegador (Google en Android/Chrome, Apple en iPhone).

- **Android / escritorio**: funciona desde el navegador o con la app instalada.
- **iPhone / iPad**: solo con iOS 16.4+ y la app **instalada** en la pantalla de inicio.
- Cada teléfono se activa por separado, siempre con un toque de la persona (el navegador pide permiso).

## Código de módulo (RBAC)
Sin módulo propio: los 4 endpoints son de **autoservicio** (`SELF_SERVICE_ROUTES` en
`middlewares/user-access.ts`), como "mis accesos" o el perfil. Cualquier usuario con sesión
activa gestiona solo **sus propios** teléfonos; no hay datos de otros usuarios que proteger por rol.
Quién **recibe** cada aviso sí sale del RBAC (ver "Reglas de negocio").

## Endpoints
| Método | Ruta | Acción | Acceso |
|--------|------|--------|--------|
| GET  | /push/status | ¿está configurado el servidor? + clave pública VAPID | sesión (autoservicio) |
| POST | /push/subscribe | guardar la suscripción de este teléfono (`endpoint` https + `keys.p256dh`/`keys.auth`) | sesión (autoservicio) |
| POST | /push/unsubscribe | apagar este teléfono (`endpoint`); solo toca suscripciones propias | sesión (autoservicio) |
| POST | /push/test | aviso de prueba a los teléfonos del propio usuario (`404 PUSH_NOT_SUBSCRIBED`, `409 PUSH_DISABLED`) | sesión (autoservicio) |

## Vistas de frontend vinculadas
- Ninguna vista propia: diálogo **"Notificaciones en este teléfono"** desde el menú de perfil
  (`grulla_fe/src/modules/pushNotifications`). Al tocar el aviso se abre
  `/cotizaciones?abrir=<id>` (detalle de esa cotización).

## Botones/acciones vinculadas
- Ninguno con permiso propio (autoservicio).

## Reglas de negocio propias del módulo
- **Quién recibe "Nuevo pedido para cotizar"** (`services/notify_quote_request.ts`): usuarios
  activos de la **misma empresa** cuyo rol tiene `cotizacion.complete.button` y que son de la
  **tienda del pedido** o no tienen tienda (admins de empresa). Nunca otra empresa ni otra tienda.
- El aviso sale **después del commit** del pedido (`transaction.afterCommit`) y nunca lo frena ni
  lo hace fallar: un error al avisar solo queda en `last_error`.
- Un mismo teléfono (mismo `endpoint`) pertenece a **un solo usuario**: si otro usuario lo activa,
  pasa a ser suyo (`endpoint_hash` único).
- **"Salir"** apaga los avisos de ese teléfono (el aviso trae el nombre del cliente).
- Si Google/Apple responde 404/410 (la suscripción ya no existe), se marca `active = false` sola.
- Envío en tandas de 10, TTL 6 h, urgencia alta, `topic` = `tag` (`quote-<id>`): un mismo pedido no se apila.

## Configuración (variables de entorno)
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`: se generan **una sola vez** con `npm run push:keys`
  (o las trae el `.env` de `npm run release`). **No cambiarlas después**: los teléfonos ya
  activados dejarían de recibir avisos hasta volver a activarlos.
- `VAPID_SUBJECT`: contacto para Google/Apple (por defecto `mailto:hola@vanysperu.com`).
- Sin claves, `/push/status` responde `enabled: false` y no se envía nada (la app sigue igual).

## Campos especiales
- Tabla `push_subscription` (migración `20261118100000`): `endpoint` (hasta 700), `endpoint_hash`
  (sha256, único), `p256dh`, `auth`, `user_agent`, `active`, `last_sent_at`, `last_error`,
  `company_id` (NULL para Super Administrador), auditoría completa.

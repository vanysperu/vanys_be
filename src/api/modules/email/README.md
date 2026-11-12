# Módulo: email (cola de correos)

## Código de módulo (RBAC)
No tiene pantalla ni endpoints propios: lo usan otros módulos (enlaces de
contraseña y, en el ítem 7 del Sprint 2, envío de cotizaciones).

## Endpoints
| Método | Ruta                 | Acción                         | Acceso |
|--------|----------------------|--------------------------------|--------|
| POST   | /internal/jobs/tick  | manda los correos pendientes (y las demás tareas programadas) | cabecera `X-Cron-Secret` |

## Vistas de frontend vinculadas
- Ninguna.

## Botones/acciones vinculadas
- Ninguno.

## Reglas de negocio propias del módulo
- **Todo correo pasa por la cola** (`email_outbox`): `enqueueEmail()` guarda el
  correo, y se manda apenas se confirma la transacción, cada minuto (timer) y con
  el cron del hosting (`/internal/jobs/tick`). En Hostinger la app se apaga sin
  tráfico, así que el envío no puede depender de un solo intento "en vivo". Si
  la transacción se revierte, el correo tampoco existe.
- **Las variables de la plantilla se guardan cifradas** (`payload_encrypted`,
  AES-256-GCM con `core/security/secretBox.ts`), porque llevan enlaces de
  contraseña. Se borran al enviarse o al fallar del todo.
- **Proveedor intercambiable** (`EMAIL_PROVIDER`):
  - `brevo`: API HTTPS, sin librería y sin depender de los puertos SMTP del
    hosting. Necesita `BREVO_API_KEY` y `EMAIL_FROM_ADDRESS`; `EMAIL_FROM_NAME`
    es opcional (por defecto "Vanys").
  - `log`: solo desarrollo, escribe en la consola a quién iba el correo.
  - Sin configurar: `log` en desarrollo y ninguno en producción. Sin proveedor,
    el correo queda fallido con el motivo, y el admin copia el enlace para
    mandarlo por WhatsApp (decisión del usuario).
- **Reintentos:**
  - error temporal: reintenta a los 1, 5, 15 y 60 minutos, y después del quinto
    intento queda fallido;
  - error permanente (correo inválido, clave mal configurada): fallido de
    inmediato.
  - Un correo en envío tiene una reserva de 5 minutos: si el proceso muere a
    mitad, vuelve a la cola.
- **Cupo diario compartido por todas las empresas** (`email_daily_usage`, día de
  Lima; `EMAIL_DAILY_LIMIT`, por defecto 300 = plan gratis de Brevo):
  - Pedido explícito del usuario: al llegar al 80 % y al agotarse, cada Super
    Administrador recibe una notificación en la campana (una vez por día). No va
    por correo, porque ya no quedaría cupo.
  - El 10 % final queda reservado para correos de seguridad (enlaces de
    contraseña): desde el 90 % los demás esperan al día siguiente, para que un
    enlace de 30 minutos no venza en la cola.
  - Si Brevo rechaza un envío por cupo (402/429), el día se da por agotado.
  - Los correos sin cupo vuelven a la cola para las 00:05 del día siguiente, sin
    contar como intento.
- **Prioridad:** primero los de seguridad, luego avisos y al final cotizaciones.
- Nunca se registran en logs direcciones completas ni enlaces.

## Campos especiales
- `email_outbox.related_type` / `related_id`: a qué pertenece el correo (ej.
  `user` + id), para mostrarlo en su historial.
- `email_daily_usage.alert_warning_at` / `alert_exhausted_at`: cuándo se avisó a
  los Super Administradores (no se repite en el mismo día).

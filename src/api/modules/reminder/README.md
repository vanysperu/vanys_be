# Módulo: reminder (Recordatorios)

## Código de módulo (RBAC)
`reminder` (módulo 17, "Recordatorios")

## Endpoints
| Método | Ruta                    | Acción                              | Requiere módulo |
|--------|-------------------------|-------------------------------------|-----------------|
| POST   | /reminder/create        | create                              | reminder        |
| PUT    | /reminder/update/:id    | update (solo quien lo creó)         | reminder        |
| GET    | /reminder/list          | list (pag)                          | reminder        |
| PUT    | /reminder/disable/:id   | disable (toggle cancelar/reactivar) | reminder        |
| GET    | /reminder/due           | vencidos sin leer (campana)         | reminder        |
| PUT    | /reminder/read/:id      | marcar como visto (destinatario)    | reminder        |
| GET    | /reminder/recipients    | usuarios a los que se puede avisar  | reminder        |

Filtros de `list`: `box` (`received` = me llegan, `sent` = los creé yo),
`status` (`active` por defecto = no cancelados; `upcoming`, `due`, `read`,
`cancelled`), `dateFrom`/`dateTo` (fecha del aviso, hora de Lima).

## Vistas de frontend vinculadas
- reminder.list (`/recordatorios`)
- Campana en la barra superior (`ReminderBell`, visible en toda la app para
  quien tiene el módulo).

## Botones/acciones vinculadas
- reminder.create.button
- reminder.update.button
- reminder.disable.button

## Reglas de negocio propias del módulo
- Pedido explícito del usuario: "crear notificaciones que salgan en el
  tiempo que yo le coloque para que me recuerde cosas a mí o a otro
  usuario".
- **Sin cron ni sockets**: el recordatorio "suena" cuando `remind_at <=
  ahora`. La campana consulta `GET /reminder/due` cada minuto (también con la
  pestaña en segundo plano, para el aviso del navegador). Funciona igual en
  un hosting donde la app se duerme (Hostinger sin VPS).
- Se avisa solo dentro de la app (toast + campana) y, si el usuario lo
  activa, con una notificación del navegador. No hay correo/WhatsApp.
- Destinatario: uno mismo (por defecto) u otro usuario **activo de la misma
  empresa con acceso al módulo** (si no lo tiene, nunca vería el aviso). Un
  Super Administrador puede avisarle a cualquiera. `company_id` se toma del
  destinatario validado, nunca del body.
- No se puede programar en el pasado (1 minuto de tolerancia).
- Solo quien lo creó puede editarlo o cancelarlo; solo mientras nadie lo haya
  visto. Solo el destinatario puede marcarlo como visto.
- Cada usuario ve únicamente sus recordatorios (los que le llegan o los que
  creó); no hay vista "de toda la empresa".
- Se otorga a todos los roles de empresa (seeder `20261018120100`) y a todo
  rol nuevo al crearse (`role/services/create`).

## Campos especiales
- `remind_at`/`read_at` se guardan en UTC; salen como fecha y hora de Lima
  separadas (`remind_date`, `remind_time`).
- El estado (`upcoming`/`due`/`read`/`cancelled`) es derivado, no una columna.
- Las consultas comparan contra `UTC_TIMESTAMP()` de MySQL: un `Date` de JS
  pasado como parámetro en SQL crudo se formatea en la hora local del
  servidor, no en UTC.

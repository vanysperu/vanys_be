# Módulo: payment

## Código de módulo (RBAC)
`payment`

## Endpoints
| Método | Ruta                          | Acción  | Requiere módulo |
|--------|-------------------------------|---------|-----------------|
| GET    | /payment/list                 | list (pag) | payment      |
| GET    | /payment/find/:id             | un pago (diálogo de corregir) | payment (resource `payment.find.endpoint`) |
| PUT    | /payment/update/:id           | update (corregir, exige `reason`) | payment |
| PUT    | /payment/disable/:id          | disable (toggle, anular/restaurar) | payment |
| GET    | /payment/:id/corrections      | historial de correcciones (pag) | payment (resource `payment.corrections.button`) |
| POST   | /quotation/:id/payments       | create  | cotizacion (resource `cotizacion.payment.create.button`, no `payment`) |

El **alta** de un pago se quedó en el módulo `cotizacion` (no se movió a
`payment`) para no romper `QuotationPaymentsSection.tsx`, que ya la usaba
antes de que este módulo existiera — un pago siempre nace ligado a una
cotización puntual. `payment` agrega la capa de gestión (listar/editar/
anular) que antes no existía: un pago solo se podía crear, nunca corregir
ni anular.

## Vistas de frontend vinculadas
- payment.list (`/pagos`) — lista TODOS los pagos de la empresa (no solo los
  de una cotización puntual), con edición y anulación.

## Botones/acciones vinculadas
- payment.update.button (editar monto/método/fecha/N° de operación/notas)
- payment.disable.button (anular/restaurar — toggle, no pide confirmación)
- payment.corrections.button (ver historial / badge "Corregido (n)"; lo
  tienen los roles con `payment.list.endpoint`, incluido el Gestor)

## Reglas de negocio propias del módulo
- Un pago vive físicamente en `quotation_payment` (no se creó una tabla
  nueva) — `company_id`/`business_unit_id` se derivan siempre vía join a su
  `quotation`, nunca se guardan sueltos en el pago.
- `total_paid` de la cotización se **recalcula siempre desde la fuente de
  verdad** (`SUM(amount) WHERE is_deleted = false`) al crear, editar o
  anular/restaurar un pago — nunca se suma/resta a mano, para no arrastrar
  un desfase si un pago se corrige más de una vez.
- Anular es un **toggle** sobre `is_deleted` (mismo patrón que
  `cash_movement`/`client`/`product`): el mismo endpoint anula o restaura
  según el estado actual. **Restaurar** pasa por las mismas reglas que un
  pago nuevo (no deja la cotización sobre-pagada ni con dinero estando
  cerrada), con la fila bloqueada.
- Solo una cotización aceptada o en curso recibe pagos (`accepted`,
  `design_pending`, `in_process`, `ready`, `delivered`, `finished`): una
  Pendiente cobra su adelanto al aceptarse; una cerrada no recibe plata.
- **Efectivo = sin cuenta**: un pago con método `cash` nunca guarda
  `payment_account_id` (si llega, se descarta). La migración
  `20261031100000` limpió los que habían quedado así.
- Monto con máximo 2 decimales y fecha real, no futura (hora de Lima) —
  reglas compartidas en `core/validators/money.validator.ts`.
- Editar/anular usa el alcance de **ESCRITURA** (`resolveWriteScope`): el
  pago hereda empresa y tienda de su cotización; otra empresa responde 403
  (histórico del módulo), otra tienda de la misma empresa 404 — aunque el
  usuario tenga "ver todas las tiendas" (ese permiso es solo de lectura).
  Find e historial usan el alcance de lectura.
- Gestor (rol plantilla id=6) solo tiene `payment.list`/`payment.
  list.endpoint` — puede VER el listado (y crear pagos vía el resource ya
  existente de cotizaciones) pero nunca editar ni anular; eso es exclusivo
  de Administrador/Super Administrador.

- **Cuenta de destino** (pedido explícito del usuario: "no especifica a qué
  banco fue realizado"): `payment_account_id` apunta a una fila de
  `general_variable` con categoría `payment_account` (banco/Yape/Plin,
  cargadas en "Documentos de la empresa"). `null` = efectivo. Si el método
  no es efectivo y la empresa tiene cuentas activas, es obligatoria
  (`PAYMENT_ACCOUNT_REQUIRED`); la cuenta debe ser de la misma empresa y no
  estar deshabilitada. Editar un pago manteniendo su cuenta original no la
  revalida (se puede corregir un pago viejo aunque esa cuenta ya no se use).
- Filtros de `list`: `status` (`active`/`disabled`/`all`), `method`,
  `paymentAccountId` (id o `cash`), `clientName`, `dateFrom`/`dateTo`.

## Campos especiales
- `payment_account_id` (FK a `general_variable`, `SET NULL`) se agregó en
  `20261018100100-add-payment-account-to-money-movements.js`.
- `is_deleted` se agregó en la migración
  `20261011100000-add-is-deleted-to-quotation-payment.js` — la tabla
  original no soportaba anular un pago, solo crearlo.

## Notas
- `GET /payment/list` soporta `includeDisabled=true` para traer también los
  pagos anulados (el frontend de `/pagos` siempre lo pide así, para mostrar
  el badge "Anulado" en vez de ocultarlos — distinto del criterio de
  `cash_movement`, que sí los oculta para siempre).

## Corrección de un pago (editar en el lugar + historial inmutable)
- `PUT /payment/update/:id` mantiene el contrato de cuerpo completo (monto,
  método, fecha, cuenta, N° de operación, notas) y exige `reason` (5–500).
  No se corrige `quotation_id`: mover un pago de cotización es anularlo y
  registrarlo de nuevo.
- Una sola transacción con el orden de locks **cotización → pago** (el mismo
  que registrar y anular; antes anular bloqueaba pago → cotización):
  UPDATE, `total_paid` recalculado desde la fuente (nunca deltas), fila en
  `money_correction` (fuente `quotation_payment`, solo lo que cambió + nombre
  de la cuenta), evento `payment_updated` en la cotización (con el motivo) y
  `log`.
- Códigos: pago anulado → 409 `PAYMENT_ANNULLED`; nada cambió → 400
  `NO_CHANGES`; subir el monto por encima del saldo (también al crear y al
  restaurar) → 400 `PAYMENT_EXCEEDS_BALANCE` ("…el saldo pendiente es S/ X");
  bajarlo siempre se permite; cotización cerrada → 409 `QUOTATION_NOT_ACTIVE`;
  pasar a efectivo fuerza cuenta nula; salir de efectivo sin cuenta (si la
  empresa tiene cuentas) → 400 `PAYMENT_ACCOUNT_REQUIRED`.
- **Cierre mensual de caja (fase 2)**: crear un pago con `paid_at` en un mes
  cerrado → 409 `CASH_PERIOD_CLOSED` (también el adelanto al aceptar).
  Corregir o anular/restaurar un pago de un mes cerrado es un **ajuste**:
  el pago se corrige en el lugar (`total_paid` y saldo por cobrar se
  recalculan como siempre) y la diferencia en caja se registra con dos
  patas (`hold` en la fecha original, `posting` hoy) y
  `money_correction.kind = 'adjustment'`. Requiere `cash_closing.adjust.button`
  (403 `CASH_PERIOD_ADJUST_FORBIDDEN`). `PUT /payment/disable/:id` acepta
  `{ reason?: string }` (5–500), obligatorio solo si es ajuste (400
  `ADJUSTMENT_REASON_REQUIRED`). Mover `paid_at` a un mes cerrado → 409.
  Cambiar solo notas/N° de operación/método sin cambiar cuenta ni monto → sin
  patas. Las respuestas traen `kind` y `adjusted_period`. Sin caja
  configurada, igual que la fase 1. Detalle: `cash_movement/README.md`.
- `GET /payment/list` trae `corrections_count` por pago.

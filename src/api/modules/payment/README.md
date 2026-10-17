# Módulo: payment

## Código de módulo (RBAC)
`payment`

## Endpoints
| Método | Ruta                          | Acción  | Requiere módulo |
|--------|-------------------------------|---------|-----------------|
| GET    | /payment/list                 | list (pag) | payment      |
| PUT    | /payment/update/:id           | update  | payment         |
| PUT    | /payment/disable/:id          | disable (toggle, anular/restaurar) | payment |
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
  según el estado actual.
- Editar/anular valida que el pago pertenezca a una cotización de la propia
  empresa (y tienda, si el caller está limitado a una) vía
  `assertQuotationBelongsToCaller` (reexportado desde
  `quotation/controllers/quotation.controller.ts`).
- Gestor (rol plantilla id=6) solo tiene `payment.list`/`payment.
  list.endpoint` — puede VER el listado (y crear pagos vía el resource ya
  existente de cotizaciones) pero nunca editar ni anular; eso es exclusivo
  de Administrador/Super Administrador.

## Campos especiales
- `is_deleted` se agregó en la migración
  `20261011100000-add-is-deleted-to-quotation-payment.js` — la tabla
  original no soportaba anular un pago, solo crearlo.

## Notas
- `GET /payment/list` soporta `includeDisabled=true` para traer también los
  pagos anulados (el frontend de `/pagos` siempre lo pide así, para mostrar
  el badge "Anulado" en vez de ocultarlos — distinto del criterio de
  `cash_movement`, que sí los oculta para siempre).

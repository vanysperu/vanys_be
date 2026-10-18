# Módulo: receivable (Por cobrar)

## Código de módulo (RBAC)
`receivable` (módulo 16, "Por cobrar")

## Endpoints
| Método | Ruta              | Acción     | Requiere módulo |
|--------|-------------------|------------|-----------------|
| GET    | /receivable/list  | list (pag) | receivable      |

Módulo de **solo lectura**: no tiene create/update/disable porque no tiene
tabla propia. El cobro se registra como un pago normal de la cotización
(`POST /quotation/:id/payments`).

Filtros de `list`: `status` (estado de la cotización), `clientName`,
`businessUnitId` (solo si el usuario no está atado a una tienda),
`dateFrom`/`dateTo` (fecha de emisión, hora de Lima), `orderBy`
(`created_at` | `balance` | `total`) y `orderDir`. Por defecto, la más antigua
primero.

La respuesta trae, además de `data`/`meta`, un `summary` con
`total_balance` (suma de saldos de TODO lo filtrado, no solo de la página) y
`quotation_count`.

## Vistas de frontend vinculadas
- receivable.list (`/por-cobrar`)

## Botones/acciones vinculadas
- Ninguno propio. "Registrar pago" abre el detalle de la cotización y usa el
  botón ya existente `cotizacion.payment.create.button`.

## Reglas de negocio propias del módulo
- Pedido explícito del usuario: "quiero poder ver los pagos que me falta
  cobrar de cotizaciones".
- Cuenta una cotización si su saldo (`total - total_paid`) es de al menos
  S/ 0.01 y su estado es `accepted`, `design_pending`, `in_process`, `ready`,
  `delivered` o `finished`. Una cotización `pending` todavía no es una deuda;
  una `rejected`/`expired`/`cancelled` ya no se va a cobrar.
- Alcance: empresa y tienda salen del token (`resolveBusinessUnitFilter`),
  igual que el listado de cotizaciones.
- Se otorgó (seeder `20261018120100`) a los roles que ya veían "Pagos
  recibidos".

## Campos especiales
- `last_paid_at`: fecha del último pago no anulado (subconsulta agrupada, sin
  N+1).

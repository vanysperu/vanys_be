# Módulo: purchase_order

## Código de módulo (RBAC)
`purchase_order`

## Endpoints
| Método | Ruta                                  | Acción                         | Requiere módulo |
|--------|---------------------------------------|---------------------------------|-----------------|
| GET    | /purchase-order/list                  | list (pag)                      | purchase_order |
| GET    | /purchase-order/find/:id               | getById (con items + compras)   | purchase_order |
| POST   | /purchase-order/create                | create                          | purchase_order |
| PUT    | /purchase-order/item/:itemId/status   | cambiar estado de un item (pending/not_needed) | purchase_order |
| POST   | /purchase-order/item/:itemId/purchases | registrar una compra de un item | purchase_order |

No existe acción de deshabilitar — una orden de compra no se "deshabilita",
su estado (`pending`/`purchased`) se calcula solo a partir de sus items.

## Vistas de frontend vinculadas
- purchase_order.list (`/ordenes-compra`)
- Detalle embebido dentro del diálogo de una cotización (pestaña "Compras").

## Botones/acciones vinculadas
- purchase_order.create.button
- purchase_order.item.updateStatus.button
- purchase_order.item.registerPurchase.button

## Reglas de negocio propias del módulo
- Una orden de compra no tiene columna propia de tienda: hereda la de su
  `quotation` (`business_unit_id`) — el alcance de tienda de un Gestor se
  resuelve con un lookup a la cotización dueña, no a la orden directamente.
- Un item puede conseguirse en varias compras parciales (ej. 500 lapiceros:
  100 acá, 200 allá, 200 más allá) — cada compra registra cuánto se
  consiguió y por cuánto, y **toda compra genera un gasto real** de la
  cotización (`quotation_expense`, categoría `"compra"`) dentro de la misma
  transacción. El item pasa a `purchased` recién cuando la suma de sus
  compras alcanza la cantidad pedida.
- El estado global de la orden (`pending`/`purchased`) se recalcula después
  de cada compra a partir de sus items — nunca se setea a mano.
- No se puede comprar más de lo que falta: cada compra valida la cantidad
  restante del item tomando un lock (`SELECT ... FOR UPDATE`) sobre el item
  y la orden, para que dos compras simultáneas del mismo item no se pisen.
- Un item que **ya tiene compras registradas no se puede marcar
  `not_needed`**: la plata ya salió (y si fue del trabajador, ya existe su
  deuda), así que anularlo dejaría el gasto huérfano y la orden se cerraría
  con un costo real sin item que lo respalde. Primero se anula la compra.
- **Origen de fondos de una compra** (pedido explícito del usuario,
  `funding_source` en `purchase_order_item_purchase`):
  - `"company"` (plata de la empresa) → flujo normal, nada más cambia.
  - `"employee"` (plata propia del trabajador) → además de la compra y el
    gasto, se crea una deuda de la empresa hacia quien puso el dinero
    (`paid_by_user_id`) — ver módulo [`employee_debt`](../employee_debt/README.md).
    Por defecto el acreedor es quien registra la compra; un admin puede
    registrarla a nombre de otro trabajador pasando `paid_by_user_id`
    explícito en el body.
- Quién puede tocar un item: el asignado de la orden (`assigned_to`,
  siempre, sin importar tienda — es su tarea personal), o un admin de la
  empresa (limitado a su propia tienda si tiene una asignada).

## Campos especiales
- `purchase_order_item_purchase.funding_source`/`paid_by_user_id` se
  agregaron en la migración
  `20261011100100-add-funding-source-to-purchase-order-item-purchase.js`
  (antes toda compra se asumía pagada con plata de la empresa).

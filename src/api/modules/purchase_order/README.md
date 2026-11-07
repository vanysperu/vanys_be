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
| GET    | /purchase-order/purchase/find/:id      | compra por id (diálogo de corrección) | purchase_order (`purchase_order.purchase.find.endpoint`) |
| PUT    | /purchase-order/purchase/update/:id    | corregir compra                  | purchase_order (`purchase_order.purchase.update.button`) |
| PUT    | /purchase-order/purchase/disable/:id   | anular compra (una sola vía)     | purchase_order (`purchase_order.purchase.disable.button`) |
| GET    | /purchase-order/purchase/:id/corrections | historial de correcciones (pag) | purchase_order (`purchase_order.purchase.corrections.button`) |

### Corrección y anulación de compras
- Campos corregibles: `amount`, `quantity` (entero ≥ 1), `funding_source`, `paid_by_user_id`, `payment_account_id` (solo con plata de la empresa), `spent_at` (fecha del gasto = `incurred_at` de la deuda). NO: el item ni la cotización. Motivo obligatorio; sin cambios → 400 `NO_CHANGES`.
- Bloqueo SIEMPRE en el orden item → orden → compra → gasto → deuda (`services/shared/purchase_lock.service.ts`). Fuera del alcance de escritura → 404 (la excepción "el asignado puede tocar el item" no aplica a corregir/anular).
- Cantidad: subirla por encima de lo que falta sin `allow_exceed` → 409 `PURCHASE_EXCEEDS_REMAINING` (con `ordered/already_purchased/requested`). Estado del item y de la orden se recalculan desde las compras NO anuladas (`services/shared/purchase_order_status.service.ts`, único cálculo — también lo usan registrar compra y cambiar estado de item). La descripción del gasto se rehace (`Compra: <producto> x<cant>[adicional]`) conservando las notas después del primer " — ".
- Monto: se escribe en compra, gasto y deuda juntos. Con plata del trabajador y monto < lo ya repuesto → 409 `DEBT_BELOW_REIMBURSED`; igual → la deuda queda pagada. El estado de la deuda sale siempre de `recalculateDebtsState`.
- Empresa → trabajador: cuenta en el body → 400 `PAYMENT_ACCOUNT_NOT_ALLOWED`; trabajador inactivo o de otra empresa → 400 `EMPLOYEE_NOT_AVAILABLE` (sin indicarlo, el que corrige, igual que al registrar). Se crea la deuda o se reactiva la anulada de esa compra (UNIQUE `purchase_order_item_purchase_id`). Trabajador → empresa o cambio de trabajador: solo sin nada repuesto (deuda anulada / reasignada); si no → 409 `PURCHASE_DEBT_REIMBURSED`. Explícito `paid_by_user_id` con plata de la empresa → 400 `PAID_BY_NOT_ALLOWED`.
- Anular: con algo repuesto → 409 `PURCHASE_DEBT_REIMBURSED`; ya anulada → 409 `PURCHASE_ANNULLED` (también al corregir). Marca compra y gasto `is_deleted`, anula la deuda, recalcula item y orden. Sin restauración.
- Factura al corregir (`has_invoice`, `invoice_id`; ausentes = no se toca): se puede crear una nueva, pasar la compra a otra factura registrada o quitarla, también sin cambiar nada más. Sacarla de una factura que solo la cubría a ella elimina esa factura, aunque tenga archivo (el diálogo lo advierte). Cambiar solo la factura en un mes cerrado no genera ajuste: no mueve dinero. El resultado trae `invoice_id` e `invoice_created`, y el historial guarda `invoice_status` (antes y después).
- Factura al anular: si la compra era la última de su factura, una factura sin archivo se elimina y una con archivo se conserva.
- Historial: `money_correction` con fuente `quotation_expense` y el id del GASTO (la fila de Caja); guarda `payment_account_name`, `paid_by_user_name` y, si la deuda cambió, `debt_amount`/`debt_status` antes/después. Evento `purchase_updated` / `purchase_disabled` en la cotización + log.
- Cierre mensual de caja (fase 2), con el id del GASTO como fila de Caja: registrar una compra es siempre hoy (mes abierto). Corregir o anular una compra **pagada por la empresa** de un mes cerrado es un **ajuste** (en el lugar + patas `hold`/`posting` + `money_correction.kind = 'adjustment'`; requiere `cash_closing.adjust.button`, si no 403 `CASH_PERIOD_ADJUST_FORBIDDEN`). Pasar de trabajador a empresa (o al revés) en un mes cerrado también deja patas; cambiar el monto de una compra del trabajador o la cantidad, no (no mueven caja). `PUT /purchase-order/purchase/disable/:id` acepta `{ reason?: string }` (5–500), obligatorio solo si es ajuste (400 `ADJUSTMENT_REASON_REQUIRED`). Mover `spent_at` a un mes cerrado (o a otro día dentro de él) → 409 `CASH_PERIOD_CLOSED`, aunque la compra sea del trabajador. Respuestas con `kind` y `adjusted_period`.
- Invariante (revisado por SQL en tests/purchase-expense-correction.test.ts): cada compra vigente con plata de un trabajador tiene exactamente una deuda vigente con amount = compra = gasto, user_id = paid_by_user_id, incurred_at = spent_at; una compra de la empresa o anulada no tiene deuda vigente.
- `GET /list` y `GET /find/:id` devuelven en cada item sus compras (anuladas incluidas) con `is_deleted`, gasto (`spent_at`, cuenta), quién pagó, deuda vigente y `corrections_count` — una sola consulta para todos los items.
- Registrar compra / cambiar estado de item: alcance de ESCRITURA (un usuario ligado a una tienda no compra en otra aunque tenga "ver todas las tiendas"; el asignado sigue pudiendo).

No existe acción de deshabilitar — una orden de compra no se "deshabilita",
su estado (`pending`/`purchased`) se calcula solo a partir de sus items.

## Vistas de frontend vinculadas
- purchase_order.list (`/ordenes-compra`)
- Detalle embebido dentro del diálogo de una cotización (pestaña "Compras").

## Botones/acciones vinculadas
- purchase_order.create.button
- purchase_order.item.updateStatus.button
- purchase_order.item.registerPurchase.button
- purchase_order.purchase.update.button (lápiz por compra en el checklist, Gastos de la cotización y Caja)
- purchase_order.purchase.disable.button (anular compra en el checklist, Gastos de la cotización y Caja)
- purchase_order.purchase.corrections.button (abrir el badge "Corregido (n)")

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
- Comprar más de lo que falta **exige confirmación**: sin `allow_exceed: true`
  la compra se rechaza con `409` y código `PURCHASE_EXCEEDS_REMAINING`
  (`errors: { ordered, already_purchased, requested }`), y el frontend
  muestra el modal "La cantidad a comprar era N, ¿seguro quieres comprar
  más?". Si la persona acepta, se reenvía con `allow_exceed: true` y el gasto
  queda anotado como "compra adicional: X por encima de lo pedido". La
  validación toma un lock (`SELECT ... FOR UPDATE`) sobre el item y la orden,
  para que dos compras simultáneas del mismo item no se pisen.
- **Factura de la compra** (pedido explícito del usuario): registrar una compra
  acepta `has_invoice` (boolean, opcional). Con `true` se registra en la misma
  transacción una factura `purchase` (módulo [`invoice`](../invoice/README.md))
  y la respuesta trae su `invoice_id`; el archivo se sube aparte
  (`POST /invoice/:id/file`). En el frontend la pregunta "¿La compra tiene
  factura?" es obligatoria. Una factura puede cubrir varios productos: con
  `invoice_id` la compra se suma a esa factura ya registrada, en vez de crear otra.
- Filtros de `list`: `status`, `assignedTo`, `clientName`, `assigneeName`,
  `dateFrom`/`dateTo` (fecha de creación, hora de Lima).
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
  - Con `"company"` se indica desde qué cuenta salió el dinero
    (`payment_account_id`, vacío = efectivo): de la empresa de la orden y
    activa; se guarda en el gasto y Caja lo descuenta de esa cuenta. Con
    `"employee"` se rechaza cualquier cuenta: la empresa no pagó nada todavía
    (en Caja, esa compra no suma; el egreso es la reposición).
- Quién puede tocar un item: el asignado de la orden (`assigned_to`,
  siempre, sin importar tienda — es su tarea personal), o un admin de la
  empresa (limitado a su propia tienda si tiene una asignada).

## Campos especiales
- `items[].quotationItem`: trae `color`, `product_code` y `product` con `colors`,
  `images_enabled` e `image_path`. `image_path` llega en `null` si la empresa no
  tiene fotos habilitadas (lo decide el backend). El clic en el producto abre su
  color, código y cantidad en cada lista de órdenes (Inicio, Compras y cotización);
  con fotos habilitadas, también su foto.
- Cada compra trae `invoice_id`, `invoice_has_file` e `invoice_purchases_count`
  (compras vigentes en esa factura): el diálogo de corregir los usa para ofrecer
  dejarla, moverla o quitarla y para avisar si la factura se elimina.
- `purchase_order_item_purchase.funding_source`/`paid_by_user_id` se
  agregaron en la migración
  `20261011100100-add-funding-source-to-purchase-order-item-purchase.js`
  (antes toda compra se asumía pagada con plata de la empresa).

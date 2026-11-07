# Módulo: quotation (Cotizaciones)

## Código de módulo (RBAC)
`cotizacion`

## Endpoints
| Método | Ruta                             | Acción                     | Requiere módulo |
|--------|----------------------------------|----------------------------|-----------------|
| GET    | /quotation/list                  | list (pag)                 | cotizacion      |
| GET    | /quotation/board                 | tablero: cada columna con sus primeras cotizaciones y totales reales | cotizacion (`cotizacion.board.endpoint`) |
| GET    | /quotation/find/:id              | detail                     | cotizacion      |
| GET    | /quotation/:id/pdf               | PDF                        | cotizacion      |
| GET    | /quotation/:id/profit            | ganancia (`cotizacion.profit.view.button`) | cotizacion |
| GET    | /quotation/:id/reset-preview     | qué borraría el reset (solo Super Administrador) | cotizacion (`cotizacion.resetPreview.endpoint`) |
| PUT    | /quotation/:id/reset             | resetear a Pendiente (solo Super Administrador) | cotizacion (`cotizacion.reset.button`) |
| POST   | /quotation/create                | create                     | cotizacion      |
| PUT    | /quotation/update/:id            | update                     | cotizacion      |
| PUT    | /quotation/status/:id            | cambiar estado             | cotizacion      |
| PUT    | /quotation/:id/items             | editar la cotización (cualquier estado) | cotizacion (`cotizacion.complete.button`) |
| PUT    | /quotation/item/:itemId/stage    | mover etapa de producción  | cotizacion      |
| POST   | /quotation/:id/payments          | registrar pago             | cotizacion      |
| POST   | /quotation/:id/expenses          | registrar gasto            | cotizacion      |
| GET    | /quotation/expense/find/:id      | gasto por id (diálogo de corrección) | cotizacion (`cotizacion.expense.find.endpoint`) |
| PUT    | /quotation/expense/update/:id    | corregir gasto manual      | cotizacion (`cotizacion.expense.update.button`) |
| PUT    | /quotation/expense/disable/:id   | anular/restaurar gasto manual | cotizacion (`cotizacion.expense.disable.button`) |
| GET    | /quotation/expense/:id/corrections | historial de correcciones (pag) | cotizacion (`cotizacion.expense.corrections.button`) |
| POST   | /internal/jobs/expire-quotations | vencer cotizaciones (cron) | — (ver abajo)   |

### Corrección y anulación de gastos manuales
Botones (pestaña "Gastos" del detalle y Caja): `cotizacion.expense.update.button` (lápiz), `cotizacion.expense.disable.button` (anular/restaurar), `cotizacion.expense.corrections.button` (abrir el badge "Corregido (n)"). Un gasto de compra abre el diálogo de la compra (`purchase_order.purchase.update.button`).
- `funding_source` y `paid_by_user_id` (al registrar y corregir): con plata de un trabajador nace su deuda (origen `expense`) y el gasto no sale de Caja hasta reponerle; sigue contando como costo de la cotización. No lleva cuenta ni n.° de operación: `PAYMENT_ACCOUNT_NOT_ALLOWED` / `OPERATION_NUMBER_NOT_ALLOWED`, van en la reposición. Sin `paid_by_user_id`, el trabajador es quien registra. Monto, fecha y quién pagó se mueven con la deuda; anular la cancela y restaurar la reactiva. Con algo ya repuesto: no se anula ni se quita la deuda (`PURCHASE_DEBT_REIMBURSED`) ni se baja de lo repuesto (`DEBT_BELOW_REIMBURSED`). En el gasto de una compra este campo no se usa: manda la compra.
- `operation_number` (opcional, máx. 50): n.° de operación del gasto, al registrarlo y al corregirlo. No es dinero: agregarlo o cambiarlo en un mes cerrado queda en el historial, sin ajuste.
- Campos corregibles: `amount`, `description`, `category` (texto libre ≤ 50, `null` = sin categoría), `spent_at`, `payment_account_id` (`null` = efectivo). La cotización NO se corrige (400): se anula y se registra en la correcta. Motivo `reason` obligatorio (5–500). Sin cambios → 400 `NO_CHANGES`.
- Se permite en cualquier estado de la cotización (corregir un error no registra dinero nuevo).
- Gasto de una compra → 409 `EXPENSE_BELONGS_TO_PURCHASE` (se corrige/anula como compra, ver purchase_order). Gasto anulado → 409 `EXPENSE_ANNULLED` (restaurarlo antes).
- Cada corrección: una transacción con el gasto bloqueado; UPDATE en el lugar + fila inmutable en `money_correction` (fuente `quotation_expense`, con `payment_account_name`) + evento `expense_updated` + log. Anular/restaurar: evento `expense_disabled` / `expense_restored` + log.
- Cierre mensual de caja (fase 2): crear un gasto con `spent_at` en un mes cerrado → 409 `CASH_PERIOD_CLOSED`. Corregir o anular/restaurar un gasto de un mes cerrado es un **ajuste** (en el lugar + patas `hold`/`posting` + `money_correction.kind = 'adjustment'`; requiere `cash_closing.adjust.button`, si no 403 `CASH_PERIOD_ADJUST_FORBIDDEN`). `PUT /quotation/expense/disable/:id` acepta `{ reason?: string }` (5–500), obligatorio solo si es ajuste (400 `ADJUSTMENT_REASON_REQUIRED`). Mover `spent_at` a un mes cerrado → 409. Descripción/categoría → sin patas. Respuestas con `kind` y `adjusted_period`. Detalle: `cash_movement/README.md`.
- Un gasto anulado (`is_deleted`) no suma en Caja, Estadísticas, márgenes ni en el total de la pestaña Gastos; el detalle (`GET /quotation/find/:id`) lo sigue devolviendo (tachado), con `purchase_id` y `corrections_count`.
- Escritura con `resolveWriteScope`: fuera de alcance → 404. Al REGISTRAR pagos, adelantos o gastos, un usuario ligado a una tienda (aunque tenga "ver todas las tiendas") solo lo hace en cotizaciones de su tienda: si la ve pero no es suya → 403 `STORE_WRITE_SCOPE`.
- `PAYMENT_EXCEEDS_BALANCE` (sobre-pago) llega con su código: el controller ya no lo re-envuelve.
- Una compra anulada no bloquea rechazar/cancelar la cotización (`assertNoMoneyInvolved`). Los gastos manuales siguen sin bloquearla (fuera de alcance, decisión 6).

`/internal/jobs/expire-quotations` no lo usa ningún usuario: lo llama cada
hora el cron del hosting y se autentica con el secreto compartido
`CRON_SECRET` en la cabecera `X-Cron-Secret` (no con sesión ni RBAC). Si
`CRON_SECRET` no está configurado, el endpoint queda apagado (404), nunca
abierto. Existe porque en el hosting la app se apaga sola sin tráfico, y el
`setInterval` interno no alcanza.

## Reglas de negocio propias del módulo

### Alcance y referencias
- `company_id` sale siempre de la sesión. Además, **todo lo que la
  cotización referencia se valida contra esa empresa** (cliente, tienda,
  producto, técnica): validar solo el dueño de la cotización protegía el
  encabezado pero no sus referencias (`TenantMismatchError`).
- **El catálogo deshabilitado no se puede usar en cotizaciones nuevas**
  (`DisabledCatalogEntityError`): un cliente/producto/técnica con
  `is_deleted = true` significa "ya no se usa", pero la API lo seguía
  aceptando aunque el formulario no lo ofreciera. Las cotizaciones **ya
  existentes** que lo referencian no se tocan: se siguen viendo completas.
- `update` usa una **lista blanca explícita** de campos editables. Antes
  hacía spread del body, así que se podía reasignar `company_id`,
  `client_id`, `status` o `total` por fuera de sus flujos.

### Editar (`PUT /quotation/:id/items`)
Toda cotización se puede editar, en cualquier estado (pedido explícito del
usuario). Cambian productos, técnica, modo, cantidades, color, notas, IGV,
delivery/diseño, días de producción y "a nombre de". Cliente, empresa, tienda y
estado no cambian. Mismo alcance de escritura que pagos
(`assertQuotationWritable`). No se borra y recrea: `items[].id` indica el item
existente y se aplica solo la diferencia.
- Un item existente conserva su etapa, sus compras y su **precio pactado**
  mientras no cambien producto, técnica ni modo: el catálogo pudo cambiar.
  Cambiar la cantidad no recotiza. Lo nuevo o cambiado usa las reglas de crear.
- Un item con orden de compra no se puede quitar ni cambiar de producto →
  409 `QUOTATION_ITEM_HAS_PURCHASE_ORDER` (la orden se borraría en cascada).
- El total no puede quedar por debajo de lo cobrado → 400 `TOTAL_BELOW_PAID`.
- Cada edición queda en el Historial con el total anterior y el nuevo.

### Estados
- **`quote_requested` ("Pendiente de cotizar")**: pedido que llegó desde la
  web (`POST /api/public/quotation-request`, ver
  [`web_quote_request`](../web_quote_request/README.md)). Solo puede pasar a
  `pending` o `rejected`, y nunca se vuelve a él. Mientras esté así:
  - Se completa con `PUT /quotation/:id/items` (ver "Editar" abajo).
  - Pasarla a `pending` exige que esté completa (al menos un producto,
    técnica donde el producto la requiere, precio > 0); si no → 409
    `QUOTATION_INCOMPLETE`. Al pasar, `valid_until` se calcula desde ese día.
  - No cuenta en Estadísticas (`QUOTATION_SCOPE_SQL`) ni en "Por cobrar".
  - Botón del detalle: `cotizacion.complete.button` (otorgado a todo rol con
    `cotizacion.update.button`, Gestor incluido). Abre el mismo formulario
    de "Nueva cotización" en modo completar.
- Cadena principal + transiciones de salida; `rejected`, `expired`,
  `cancelled` y **`finished`** son terminales. Que `finished` no estuviera
  en esa lista permitía revertir una cotización ya cerrada y cobrada hasta
  `cancelled`.
- **No se puede rechazar ni cancelar una cotización con dinero de por
  medio** (`QuotationHasMoneyInvolvedError`): si ya tiene pagos registrados
  o compras reales hechas contra ella, el dinero quedaría colgado en una
  cotización cerrada sin ningún aviso. Tampoco se puede **volver de Aceptada
  a Pendiente** con dinero de por medio (ej. aceptada con adelanto y
  arrastrada de vuelta en el Kanban): una Pendiente sale de "Por cobrar" y
  el job la puede vencer sola.
- El cambio de estado lee la cotización **con lock dentro de la
  transacción** y valida ahí la transición y el dinero: antes se validaba
  afuera, y dos cambios casi simultáneos (o el job) pasaban la validación con
  el mismo estado de origen.
- **Solo una cotización activa avanza** (pedido explícito del usuario: "una
  cotización que no fue aceptada no debería poder hacer nada"): pagos,
  gastos, órdenes de compra, compras y movimientos de etapa de producción
  exigen un estado entre Aceptada y Finalizada
  (`services/shared/active_quotation.ts` → `assertQuotationIsActive`; si no,
  409 con code `QUOTATION_NOT_ACTIVE`). Una Pendiente cobra su adelanto al
  aceptarla; una Rechazada, Vencida o Cancelada ya no admite nada de eso.

### Dinero
- Los importes se **redondean a 2 decimales en el service** (`roundMoney`),
  que es la precisión real de las columnas `DECIMAL(10,2)`, con **medio
  céntimo hacia arriba** (como SUNAT): subtotal 374.25 → IGV 67.37 → total
  441.62. Antes el ruido binario de JavaScript (441.61499999999995) lo dejaba
  en 441.61. El precio unitario se redondea *antes* de multiplicar para que
  `precio unitario × cantidad = subtotal` cuadre exactamente con lo que ve
  el cliente en el PDF.
- Cálculo completo de una cotización (el mismo en el backend, el formulario
  de "Nueva cotización", el detalle y el PDF):
  1. Precio por unidad = precio del producto + precio de la técnica, en la
     misma escala, redondeado a 2 decimales.
  2. Subtotal de la línea = precio por unidad × cantidad.
  3. Subtotal = suma de las líneas.
  4. IGV = subtotal × tasa, redondeado **una vez** sobre toda la cotización
     (`computeQuotationIgv`); total = subtotal + IGV.
  5. IGV por producto = ese IGV repartido entre las líneas por mayor residuo
     en céntimos (`services/shared/igv_breakdown.ts`): cada fila cuadra
     (subtotal + IGV = total) y las filas suman exactamente el resumen.
- `total_paid` se recalcula con una **sentencia SQL atómica**
  (`UPDATE ... SET total_paid = (SELECT SUM ...)`), nunca leyendo y
  escribiendo en dos pasos: dos pagos concurrentes sobre la misma
  cotización se pisaban (lost update) y el total quedaba desincronizado.
- **No se admite sobre-pago**: crear o editar un pago valida el saldo
  pendiente tomando un lock sobre la cotización
  (`assertPaymentWithinBalance`), con una tolerancia de S/ 0.01 por
  redondeo.
- El subtotal es siempre `precio_por_unidad × cantidad`. Los 4 precios de
  catálogo (unidad/ciento/medio millar/millar) son **tarifas por volumen**,
  no precios de un lote cerrado.
- Si el producto **no requiere personalización** (`product.requires_customization
  = false`), el item va sin técnica y su precio es solo el del producto; el
  PDF omite la columna "Técnica" si ningún item lleva una. Ver
  [`product`](../product/README.md).
- El PDF solo lista las cuentas de pago **activas** de la empresa y que no sean
  internas (`show_in_quotation`, ver `variable_general/README.md`). Sin ninguna, no
  imprime esa sección.
- El PDF sale en **A4 horizontal** y lleva la columna **"Código"** (pedido
  explícito del usuario): el código del color elegido (`product_code` del
  item) o, si el item no tiene, el SKU del producto; si no hay ninguno, "—".
- Columnas del PDF por producto: con IGV, `P. unit. · Subtotal · IGV · Total`
  (el IGV de cada línea sale del reparto de arriba sobre el IGV real
  cobrado, `total - subtotal`, nunca del % configurado hoy); sin IGV, una
  sola columna `Total (sin IGV)`. En el resumen, el IGV se muestra siempre
  (su % real o "No incluido") y cierra con "Total a pagar". Mismo criterio
  que el detalle de la cotización en pantalla. Antes cada pantalla calculaba
  el IGV por fila a su manera: en ~6% de las cotizaciones con varios
  productos las filas del PDF no sumaban el resumen.
- La columna "Modo" del PDF nunca dice "Personalizado": un precio negociado
  es interno y el cliente no lo ve (esa fila muestra "—"). Si todos los items
  tienen precio personalizado, la columna no aparece.
- Cambiar `includes_igv` por `PUT /quotation/update/:id` recalcula el total
  con el mismo redondeo y **no puede dejarlo por debajo de lo ya pagado**
  (`TotalBelowPaidError`, 400).
- `GET /quotation/list` devuelve además un `summary` calculado en la base
  sobre **todo lo filtrado** (no solo la página): `receivable_balance` /
  `receivable_count` con el mismo criterio que el módulo
  [`receivable`](../receivable/README.md) (estados de aceptada en adelante y
  saldo ≥ S/ 0.01) y `expired_balance` / `expired_count`. El Panel principal
  usa estos totales; antes sumaba en el navegador las últimas 100
  cotizaciones e incluía las pendientes.
- El precio por unidad de un item es **precio del producto + precio de la
  técnica en la MISMA escala** (ver
  [`customization_technique`](../customization_technique/README.md)): jabón
  ciento 0.90 + serigrafía ciento 0.95, 10 unidades = 18.50. Si el producto o
  la técnica no tienen precio en esa escala, se rechaza la cotización.
- **Adelanto al aceptar** (pedido explícito del usuario): `PUT /quotation/status/:id`
  acepta un `advance_payment` opcional (mismos campos que un pago) SOLO cuando
  `status = "accepted"`. El cambio de estado y el pago van en la MISMA
  transacción: si el pago falla (sobre-pago, cuenta inválida), la cotización
  no queda aceptada. Exige además el permiso de registrar pagos
  (`POST /quotation/*/payments`). En el frontend, al pasar de Pendiente a
  Aceptada (botón o arrastre en el Kanban) aparece el modal "¿El cliente pagó
  adelanto?" con la mitad del total sugerida.
- **Factura al cerrar** (pedido explícito del usuario): `PUT /quotation/status/:id`
  acepta `invoice_issued` (boolean, opcional). Con `status = "finished"` e
  `invoice_issued: true` registra en la misma transacción una factura
  `issued` (módulo [`invoice`](../invoice/README.md)) que queda en "Faltan
  subir" hasta que se suba su archivo. La respuesta es
  `{ updated, invoice_id }` (`invoice_id` null si no se registró factura).
  En el frontend, pasar a Finalizada (botón o arrastre) abre el modal
  "¿Emitimos factura?" con la opción de tomar la foto o subir el archivo.
- Un pago que no es en efectivo exige `payment_account_id` (cuenta de la
  empresa a la que entró el dinero) cuando la empresa tiene cuentas activas
  (`resolvePaymentAccountForQuotation`); la cuenta se valida contra la
  empresa de la cotización.
- Filtros de `list`: `status`, `clientId`, `createdBy`, `businessUnitId`
  (solo si el usuario no está atado a una tienda), `dateFrom`/`dateTo`
  (fecha de emisión, hora de Lima).
- El IGV no es constante: sale de una Variable General por empresa
  (`getIgvRate`). Una fila **deshabilitada** no cuenta (antes, si la empresa
  deshabilitaba su IGV propio, se le seguía aplicando); lo mismo para los
  días de vigencia (`getQuotationValidityDays`).

### Consistencia
- Crear una cotización escribe cabecera + items + evento de timeline en
  **una sola transacción**. El evento `created` iba después del commit, así
  que un fallo ahí dejaba la cotización sin timeline, sin forma de
  repararlo salvo tocando la BD a mano.
- `valid_until` se calcula solo a partir de la configuración de la empresa
  si no viene en el body (antes quedaba `null` y la cotización no vencía
  nunca). Se cuenta desde el día de emisión **en Lima**: antes se usaba el
  día UTC, y una cotización emitida después de las 7 p. m. quedaba vigente
  un día de más.

### Fechas y vencimiento
- Todo lo que depende del "día calendario" se resuelve en America/Lima
  (`utils/dateUtils.ts`), sin importar la zona del servidor. El proceso
  además fija `TZ=America/Lima` al arrancar (`config/bootstrap.ts`).
- "Válida hasta el 22" significa vigente todo el 22 en Lima. El job la vence
  recién cuando en Lima ya es 23. Antes comparaba contra un `Date` y, en un
  servidor en UTC, vencía a las 7 p. m. de Lima.
- El job vuelve a exigir `status = "pending"` en el UPDATE: antes, si un
  usuario aprobaba la cotización entre la lectura y la escritura del job,
  este la pisaba a "Vencida". Cada vencimiento y su evento de timeline van
  en una transacción.
- El job **no vence una cotización con pagos** (`total_paid > 0`): "Vencida"
  es final y el dinero quedaría colgado; queda Pendiente, a la vista.

### Tablero (`GET /quotation/board`)
Pedido explícito del usuario: "cuando paso una cotización del carrito a
Pendiente no se lista". La pantalla pedía las 100 cotizaciones más nuevas de
TODOS los estados y las repartía en columnas, ordenadas por creación: una
cotización vieja recién pasada a Pendiente quedaba al fondo o fuera.
- `quotation.status_changed_at` (migración 20261106100000): cuándo llegó a su
  estado actual. Se actualiza al crear, en cada cambio de estado y al vencer.
- Cada columna (la cadena principal: Pendiente de cotizar → Finalizada) trae
  sus primeras `perStatus` (20 por defecto, máx. 50), de la que cambió de
  estado más recientemente a la más antigua, más `total_count` y
  `total_amount` de TODA la columna. Mismos filtros y alcance que el listado.
- "Ver más" en una columna usa el listado:
  `GET /quotation/list?status=pending&orderBy=status_changed_at&orderDir=desc&page=2`.
- `orderBy` del listado solo acepta `created_at`, `status_changed_at`,
  `updated_at`, `total` o `id` (antes una columna inexistente daba 500).

### Detalle (`GET /quotation/find/:id`)
- Cada item trae `product_code` y `color` (lo elegido, como copia) y su `product`
  trae `colors` y `codes` vigentes: el formulario de completar los necesita
  aunque el producto no esté en su selector de 100.
- Items, pagos, gastos e historial se leen en consultas separadas
  (`separate: true`): en un solo JOIN se multiplicaban entre sí, y Sequelize
  ignoraba su `order`. Items y pagos/gastos salen en el orden en que se
  cargaron; el historial, del más reciente al más antiguo.
- El PDF formatea `valid_until` (DATEONLY) como texto, sin pasar por un
  `Date` local. Antes salía **un día antes** de lo guardado.

## Campos especiales
- `quotation_item.product_code` / `color`: variante elegida, opcional. Al crear o
  completar, el color tiene que ser del producto
  (`400 QUOTATION_ITEM_COLOR_NOT_FOUND`) y el código se ajusta al color elegido
  (ver `services/shared/item_variant.ts`). Se ven en el detalle, en producción
  y en compras. El PDF muestra solo el color: el código de proveedor es interno.
- `billing_name` / `billing_document_number`: solo afectan lo que se
  imprime en el PDF — `client_id` sigue siendo el cliente real vinculado.
- `expenses[].purchase_funding_source`: quién puso la plata de la compra de ese
  gasto (`null` = gasto manual). Con eso se anula la compra desde la pestaña Gastos.
- `includes_delivery` / `includes_design` son informativos;
  `includes_igv` sí afecta el cálculo del total.

## Resetear una cotización (`PUT /quotation/:id/reset`)
Pedido explícito del usuario: que el super admin pueda devolverla a Pendiente con
todo su dinero borrado físicamente. Exige `requireSystemRole` y motivo (5–500).
Los dos recursos son exclusivos de plataforma (`core/rbac/systemOnlyModules.ts`):
no se ofrecen ni llegan a un rol de empresa.

- `GET /quotation/:id/reset-preview` usa el mismo plan que el reset
  (`services/reset/reset_plan.ts`): devuelve lo que se borraría, `can_reset`,
  `blocked_reason` y `blocked_periods`.
- Una sola transacción borra, de hijos a padres: patas de ajuste, correcciones,
  facturas emitidas, vínculos de facturas de compra, aplicaciones y reposiciones,
  deudas, compras, items de orden, movimientos de Caja vinculados, órdenes,
  gastos y pagos.
- Lo compartido con otra cotización no se pierde: una reposición que también pagó
  otras deudas baja su monto y una factura que cubre otras compras se conserva y
  se reapunta a la primera que queda. Google Drive nunca se toca.
- Queda la cotización con cliente, productos, precios e historial. Pasa a
  `pending`, `total_paid` 0, items en la primera etapa y `valid_until` renovada
  (si no, el job la vencería esa misma noche). Agrega el evento `quotation_reset`.
- 409 `QUOTATION_RESET_CLOSED_PERIOD` (`errors.periods`): algo cae en un mes
  cerrado, incluidas filas ya anuladas como ajuste. Hay que reabrir ese mes: un
  mes cerrado nunca cambia por debajo.
- 409 `QUOTATION_RESET_NOT_QUOTED`: pedido web todavía sin cotizar.
- 409 `QUOTATION_RESET_NOTHING`: ya está en Pendiente y no tiene nada que borrar.

## Ganancia de la cotización (`GET /quotation/:id/profit`)
Pedido explícito del usuario: ver cuánto se le sacó a cada cotización (solo en el sistema,
nunca en el PDF). Pestaña "Ganancia" del detalle, solo para roles con el botón
`cotizacion.profit.view.button` (seeder `20261107130000`: los administradores que pueden
corregir pagos; un Gestor recibe 403).
- `net_profit` = pagos recibidos − IGV de esos pagos − gastos − compras + IGV recuperable de
  las compras con factura. Pagos y gastos anulados no cuentan.
- Una compra cuenta como costo aunque la haya pagado un trabajador (el costo existe).
- `projected_profit` = subtotal − gastos − compras + IGV recuperable (cuando se cobre todo).
- Cálculo en `services/find/profit.service.ts`; tipos en `types/profit.types.ts`.

# Módulo: cash_movement (Caja)

## Código de módulo (RBAC)
`cash_movement`

## Endpoints
| Método | Ruta                       | Acción       | Requiere módulo |
|--------|----------------------------|--------------|-----------------|
| GET    | /cash-movement/list        | list (pag)   | cash_movement   |
| GET    | /cash-movement/month-summary?period=YYYY-MM | resultado del mes + IGV estimado + neto (`cash_movement.monthSummary.endpoint`) | cash_movement |
| POST   | /cash-movement/create      | create       | cash_movement   |
| PUT    | /cash-movement/disable/:id | disable      | cash_movement   |
| PUT    | /cash-movement/update/:id  | update (corregir) | cash_movement |
| GET    | /cash-movement/:sourceId/corrections?source=<fuente> | historial de correcciones de CUALQUIER fila de Caja (pag; `source` por defecto `manual`) | cash_movement |

## Vistas de frontend vinculadas
- cash_movement.list

## Botones/acciones vinculadas
- cash_movement.create.button
- cash_movement.disable.button
- cash_movement.update.button (corregir; lo tienen los roles con disable)
- cash_movement.corrections.button (ver historial de cualquier fila; tipo
  botón porque `/auth/my-access` solo expone botones: el frontend decide si el
  badge "Corregido (n)" es clickable. Lo tienen los roles con
  cash_movement.list.endpoint)

Sembrados en `20261101100100-seed-cash-movement-correction-resources.js` y
renombrados/completados por `20261101110100-seed-money-correction-resources.js`.

### Corregir desde Caja una fila que NO es manual
Caja no tiene endpoint de corrección para pagos, gastos, compras, deudas ni
reposiciones: el lápiz de cada fila abre el diálogo del módulo dueño, que
llama a SU endpoint. Botón por fuente: manual `cash_movement.update.button`,
`quotation_payment` `payment.update.button`, `quotation_expense`
`cotizacion.expense.update.button` (o
`purchase_order.purchase.update.button` si la fila trae `purchase_id`),
`employee_debt` `employee_debt.update.button`, `employee_debt_payment`
`employee_debt.payment.update.button`. Anular desde Caja: solo filas manuales.

## Reglas de negocio propias del módulo
- **Caja = dinero que REALMENTE entra o sale de la empresa.** Cada fila
  trae `moves_cash`: un gasto que un trabajador pagó con su plata (compra
  de orden o deuda manual) se lista para saber quién lo pagó, pero con
  `moves_cash: false` y no suma — la empresa no soltó nada. Su egreso es la
  **reposición** (`employee_debt_payment`), en su fecha, por su monto y
  desde su cuenta (ver [`employee_debt`](../employee_debt/README.md)).
- El listado es **mixto**: combina los movimientos manuales de esta tabla
  con los pagos, gastos, deudas manuales y reposiciones que registran otros
  módulos (fuentes `manual`, `quotation_payment`, `quotation_expense`,
  `employee_debt`, `employee_debt_payment`). Solo las filas con
  `source = "manual"` se pueden anular desde acá — un pago o un gasto se
  anula en su propio módulo, nunca duplicado como movimiento de caja.
- `category` es un `prefix_id` de `general_variable` (categoría
  `cash_movement_type`), igual criterio que `quotation_payment.method`.
- **Alcance de empresa/tienda**: `company_id` siempre sale de la sesión. El
  `business_unit_id` del body solo se respeta para un usuario sin tienda
  propia (admin de empresa) y se valida que la tienda sea de su empresa; a
  un usuario con tienda asignada se le fuerza la suya
  (`resolveWriteScope`, `core/rbac/writeScope.ts`; el resto vía
  `resolveTargetBusinessUnitId`). **Crear, corregir y anular usan el alcance
  de ESCRITURA**: el permiso "ver todas las tiendas" solo amplía la lectura,
  así que un gestor con ese permiso crea/corrige/anula únicamente en su
  tienda (otra tienda = 404; una fila sin tienda también queda fuera para un
  usuario con tienda propia). Un usuario de empresa sin empresa asignada
  recibe 403 `NO_COMPANY_SCOPE`.
- **Cierre mensual de caja (fase 2)** — mismas reglas para las 5 fuentes de
  Caja (manual, pago, gasto, compra, reposición):
  - **Crear** con fecha en un mes CERRADO → 409 `CASH_PERIOD_CLOSED`
    (`assertCashPeriodOpen`; errors `{ period, first_open_date }`).
  - **Corregir / anular / restaurar** una fila de un mes cerrado: se permite,
    pero se aplica EN EL LUGAR y, si cambia su efecto en caja (monto, cuenta,
    fecha, anulado), se registra como **ajuste** (`beginCashChange` /
    `complete` de `core/money/cashPeriod.ts`): la fila del historial queda con
    `money_correction.kind = 'adjustment'` y se insertan dos patas en
    `cash_adjustment_entry` (`hold` en la fecha original, que deja el mes
    cerrado exactamente como se cerró, y `posting` con fecha de hoy, que lleva
    la diferencia al mes abierto). Los valores derivados (saldo de la
    cotización, lo repuesto de cada deuda, estado del item) salen de la fila
    corregida, como siempre.
  - Hacer un ajuste exige el permiso `cash_closing.adjust.button` (o Super
    Administrador) → si no, 403 `CASH_PERIOD_ADJUST_FORBIDDEN`.
  - Anular/restaurar acepta `reason` opcional en el body (5–500); es
    obligatorio solo cuando el cambio es un ajuste → 400
    `ADJUSTMENT_REASON_REQUIRED` (nada se aplica). En un mes abierto, el
    motivo se ignora y no se registra historial (igual que la fase 1).
  - Mover la fecha A un mes cerrado (o a otro día dentro de él) → 409
    `CASH_PERIOD_CLOSED`. La fecha solo puede quedarse igual o pasar a un mes
    abierto.
  - Cambios que no mueven caja (descripción, notas, N° de operación,
    categoría, cantidad, solo el vínculo) en una fila de un mes cerrado: una
    corrección normal, sin patas.
  - Sin caja configurada (`cash_ledger`) o fila anterior al mes de inicio:
    exactamente como en la fase 1, sin restricciones ni patas.
  - Las respuestas de corregir/anular traen `kind` (`correction` |
    `adjustment`) y `adjusted_period` (`YYYY-MM` o null); el log y el evento
    de la cotización agregan "(ajuste de octubre 2026, registrado el …)".
  - Body opcional de `PUT /cash-movement/disable/:id`: `{ reason?: string }`.
  Sin esa validación, un admin podía registrar plata contra una tienda de
  otra empresa y el movimiento quedaba huérfano: ninguna vista filtrada por
  tienda lo mostraba, pero los totales de empresa sí lo sumaban.
- `quotation_id` / `purchase_order_id` son solo contexto opcional. Su
  existencia **y** su pertenencia a la empresa se validan en el controller
  (el validator solo revisa la forma del id).
- **Trazabilidad obligatoria**: caja es un libro contable, así que anular o
  reactivar un movimiento escribe una fila inmutable en `log`
  (`module = "cash_movement"`, acción `DISABLE`/`ACTIVE`, con el monto y el
  sentido) dentro de la **misma transacción** que el cambio de estado. Antes
  el toggle solo volteaba `is_deleted` y pisaba `updated_by`/`updated_at`,
  así que anular y reactivar varias veces dejaba un único rastro y no había
  forma de reconstruir quién sacó o devolvió el dinero.
- El toggle toma un lock (`SELECT ... FOR UPDATE`) sobre la fila para que
  dos cambios simultáneos no registren logs contradictorios.

- **Cuenta** de cada ingreso/egreso (`payment_account_id`, `null` =
  efectivo): en movimientos manuales la elige el usuario; en pagos sale del
  pago; en gastos de compras pagadas por un trabajador es la cuenta desde la
  que se le **repuso**.
- Gastos pagados con plata de un trabajador: la fila incluye
  `paid_by_employee_name`, `reimbursement_status`, `reimbursed_amount` y
  `reimbursed_at` ("Pagado por X con su plata · repuesto S/ a de S/ b").
  No tienen cuenta y no suman. Con filtro de cuenta (o de efectivo) no
  aparecen: no salieron de ninguna.
- Reposiciones: con filtro de tienda, cotización u orden, el monto de la
  fila es solo la parte que cubrió deudas de ahí (`reimbursement_total` trae
  el total de la reposición). La tienda de cada parte es la de la
  cotización de la compra o la de la deuda manual.
- **Cuenta de cada gasto**: la compra pagada por la empresa y el gasto
  manual de una cotización guardan desde qué cuenta salió el dinero
  (`quotation_expense.payment_account_id`, `null` = efectivo).
- **Totales**: la respuesta de `list` trae `summary` (`income`, `expense`,
  `net` y `by_account`) calculado sobre TODO lo filtrado — no sobre la
  página — y solo con lo que mueve caja. Estadísticas usa exactamente los
  mismos fragmentos SQL (`services/shared/cash_flow.sql.ts`).
- Los pagos anulados (`is_deleted`) ya no aparecen como ingreso.
- Filtros de `list`: `direction`, `source` (las 5 fuentes),
  `paymentAccountId` (id o `cash`), `category`, `quotationId`,
  `purchaseOrderId`, `dateFrom`/`dateTo`, y `companyId` solo para el Super
  Administrador (sin él, sus totales mezclan todas las empresas).
- Validaciones de un movimiento manual (compartidas con todo lo que mueve
  dinero, `core/validators/money.validator.ts`): monto > 0 con máximo 2
  decimales; fecha real, no futura (comparada en hora de Lima) y no anterior
  a 2000; cuenta de la empresa y activa.

## Corrección de un movimiento manual (editar en el lugar + historial inmutable)
- **Qué se corrige**: solo filas `source = "manual"` (tabla `cash_movement`).
  El endpoint solo conoce esa tabla; un pago se corrige en Pagos
  (`PUT /payment/update/:id`) y un gasto, deuda o reposición en su módulo.
  En la UI el lápiz solo aparece en filas manuales.
- **`operation_number`** (opcional, máx. 50): al registrar y al corregir. El listado de Caja lo
  devuelve en cada fila (`null` en una fila de plata de un trabajador). No es dinero: agregarlo o cambiarlo en un mes cerrado queda en el historial, sin ajuste.
- **Campos corregibles**: `amount`, `category`, `occurred_at`,
  `payment_account_id`, `description`, `quotation_id`, `purchase_order_id`.
  Ausente en el body = se queda como está; `null` = se limpia. `reason`
  (5–500 caracteres) es obligatorio.
- **`direction` NO se corrige** (400 si viene en el body): un ingreso que
  en realidad era un egreso no es un error de tipeo del monto, es otro
  movimiento. Cambiarle el sentido en el lugar movería el saldo por el
  DOBLE del monto (deja de sumar +X y pasa a restar −X) sin que nadie vea un
  egreso nuevo en el libro. Se anula el movimiento y se registra el
  correcto: quedan dos rastros claros (`log` DISABLE + el nuevo movimiento).
- **Mismas reglas que al crear**: monto y fecha con
  `core/validators/money.validator.ts`; la cuenta nueva con
  `resolvePaymentAccountId` (de la empresa y activa) — conservar la MISMA
  cuenta aunque se haya deshabilitado después sí se permite (igual que la
  edición de un pago); la categoría nueva debe existir y estar activa en
  `cash_movement_type` (global o de la empresa); cotización/orden de la
  misma empresa. Solo se revalida lo que cambió.
- **Guards**: no existe / otra empresa / otra tienda (alcance de escritura,
  `resolveWriteScope`) → 404 (no se confirma que el id
  existe); anulado (`is_deleted`) → 409 `CASH_MOVEMENT_ANNULLED` (primero se
  reactiva); nada cambió → 400 `NO_CHANGES`.
- **Atómico**: una sola transacción con la fila bloqueada (`SELECT ... FOR
  UPDATE`, mismo lock que el toggle): actualiza la fila (`updated_by`/
  `updated_at`, nunca `created_*`), inserta la fila de historial y escribe
  `log` (`UPDATE`, `module = "cash_movement"`). Si algo falla, no queda nada.
- **Historial** (`money_correction`, fuente `manual`; la migración
  `20261101110000-money-correction-and-annulments.js` reemplazó a la antigua
  `cash_movement_correction`): una fila por corrección, nunca se edita ni se
  borra. `previous_values`/`new_values` (JSON) guardan SOLO los campos que
  cambiaron; si cambió la cuenta, también `payment_account_name` de ese
  momento. `reason`, `company_id`, `business_unit_id` y los 4 campos de
  auditoría. El listado de Caja trae `corrections_count` en las 5 fuentes
  (subconsulta sobre el índice `(source_type, source_id, created_at)`, sin
  N+1), `purchase_id` en los gastos que son una compra y `debt_origin` en las
  deudas.
- **Historial genérico** (`GET /cash-movement/:sourceId/corrections?source=`):
  carga la fila de su fuente para resolver empresa/tienda (pago y gasto vía su
  cotización; una reposición, vía las tiendas de las deudas que cubrió) y
  aplica el alcance de LECTURA (un gestor con "ver todas las tiendas" lee el
  historial de su empresa); fuera de alcance = 404.
- **Anulados fuera de Caja**: los gastos/compras anulados
  (`quotation_expense.is_deleted`) no aparecen ni suman (`EXPENSE_ACTIVE_SQL`
  en `cash_flow.sql.ts`, usado también por Estadísticas).
- **Por qué los saldos cuadran**: no hay saldo guardado en las filas de
  dinero (el cierre de caja guarda su foto aparte y, para los meses
  cerrados, se suman también las patas de `cash_adjustment_entry`). `summary` (income/expense/net/by_account) y Estadísticas
  (`statistics/services/find/kpis.service.ts` y `trend.service.ts`) suman en
  vivo desde `cash_movement`. Corregir la fila hace que el monto viejo deje
  de sumar y el nuevo sume una sola vez, en la cuenta y fecha corregidas.

## Campos especiales
- `payment_account_id` (FK a `general_variable`, `SET NULL`) se agregó en
  `20261018100100-add-payment-account-to-money-movements.js`.
- `occurred_at` es `DATEONLY` (la fecha que declara el usuario, no el
  `created_at` del registro).
- `amount` es `DECIMAL(10,2)`; el tope de los validators es 99 999 999.99.

## Resultado del mes e IGV (`services/shared/period_finance.ts`)
Pedido explícito del usuario: ver la ganancia que va del mes, lo que quedó neto en cada
cierre y cuánto IGV hay que pagarle a SUNAT. `getPeriodFinances(scope, periods)` lo calcula
para varios meses en una sola tanda de consultas agrupadas:
- `income` / `expenses` / `adjustments`: los mismos números que Caja y Estadísticas
  (reutiliza `getTrendService` por mes). `result = income − expenses + adjustments`.
- `igv_sales`: IGV contenido en los cobros del mes de cotizaciones con IGV (cada pago lleva
  la proporción `(total − subtotal) / total` de su cotización).
- `igv_purchases`: IGV de las compras registradas "con factura" (módulo invoice) en el mes:
  `monto × tasa / (1 + tasa)` con la tasa vigente de la empresa (Variables Generales).
- `igv_balance = igv_sales − igv_purchases` (negativo = saldo a favor), `igv_payable =
  max(balance, 0)` y `net_after_igv = result − igv_payable`.
- Es una **estimación con criterio de caja** para saber cuánto apartar; el monto oficial lo
  determina el contador con los comprobantes (la pantalla lo dice).

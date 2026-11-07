# Módulo: employee_debt

## Código de módulo (RBAC)
`employee_debt`

## Endpoints
| Método | Ruta                                 | Acción                                                        | Requiere módulo |
|--------|--------------------------------------|---------------------------------------------------------------|-----------------|
| GET    | /employee-debt/list                  | list (pag, agregado por trabajador)                           | employee_debt   |
| GET    | /employee-debt/detail?userId=        | detalle (pag): cada deuda de un trabajador                    | employee_debt   |
| POST   | /employee-debt/create                | create: deuda MANUAL                                          | employee_debt   |
| PUT    | /employee-debt/disable/:id           | disable: anula una deuda manual sin reposiciones              | employee_debt   |
| PUT    | /employee-debt/pay/:userId           | registra una reposición (total o parcial, FIFO)               | employee_debt   |
| GET    | /employee-debt/payments?userId=      | historial de reposiciones (pag)                               | employee_debt   |
| PUT    | /employee-debt/payment/disable/:id   | anula una reposición registrada por error                     | employee_debt   |
| GET    | /employee-debt/find/:id              | una deuda (diálogo "Corregir deuda")                          | employee_debt   |
| PUT    | /employee-debt/update/:id            | corrige una deuda MANUAL (motivo + historial)                 | employee_debt   |
| GET    | /employee-debt/:id/corrections       | historial de correcciones de una deuda (pag)                  | employee_debt   |
| GET    | /employee-debt/payment/find/:id      | una reposición con su reparto y las deudas pendientes         | employee_debt   |
| PUT    | /employee-debt/payment/update/:id    | corrige una reposición: monto, fecha, cuenta (re-reparto)     | employee_debt   |
| GET    | /employee-debt/payment/:id/corrections | historial de correcciones de una reposición (pag)           | employee_debt   |

Resources (seeder `20261101110100-seed-money-correction-resources.js`, WP0):
`employee_debt.find.endpoint` y `employee_debt.update.button` (otorgados
como `employee_debt.disable.button`), `employee_debt.corrections.button`
(como `employee_debt.list.endpoint`), `employee_debt.payment.find.endpoint`
y `employee_debt.payment.update.button` (como
`employee_debt.payment.disable.button`),
`employee_debt.payment.corrections.button` (como
`employee_debt.payments.endpoint`).

## Vistas de frontend vinculadas
- employee_debt.list (`/deudas-personal`) — "¿a quién se le debe y cuánto?",
  agrupado por trabajador, con un detalle por trabajador (pestañas Deudas y
  Reposiciones).

## Botones/acciones vinculadas
- employee_debt.pay.button — "Marcar como pagado" (reponer).
- employee_debt.create.button — "Registrar deuda" (deuda manual).
- employee_debt.disable.button — "Anular deuda" (manual, sin reposiciones).
- employee_debt.payment.disable.button — "Anular reposición".
- employee_debt.update.button — lápiz "Corregir deuda" (solo manuales).
- employee_debt.payment.update.button — lápiz "Corregir reposición".
- employee_debt.corrections.button / employee_debt.payment.corrections.button —
  badge "Corregido (n)" clicable (abre el historial).
- Los diálogos `CorrectManualDebtDialog` y `CorrectReimbursementDialog`
  (grulla_fe `modules/employeeDebts/components`) se usan también desde Caja.
- Endpoints de lectura: employee_debt.list.endpoint,
  employee_debt.detail.endpoint, employee_debt.payments.endpoint.

El seeder `20261031100100-seed-employee-debt-resources.js` otorga los
recursos nuevos a los roles que ya tenían el permiso equivalente (lectura →
quien lista; acciones → quien repone).

## Reglas de negocio propias del módulo

### Origen de una deuda
- `purchase`: nace sola al registrar una compra de orden con
  `funding_source: "employee"` (ver
  `purchase_order/services/create/purchase_order_item_purchase.service.ts`),
  a nombre de quien puso el dinero. Una fila por compra
  (`purchase_order_item_purchase_id` es `UNIQUE`).
- `manual`: la registra un administrador, desde Deudas a personal o desde el
  botón "Deuda a personal" de Caja, para un gasto fuera de una orden
  (pedido explícito del usuario: "si un empleado fue a pagar los servicios y
  los pagó de su plata"). Guarda descripción, categoría (catálogo
  `cash_movement_type`, sin las de ingreso), fecha en que se pagó
  (`incurred_at`) y tienda opcional. Validaciones: trabajador ACTIVO de la
  misma empresa, monto > 0 con 2 decimales, fecha real y no futura,
  categoría existente y activa. Un envío idéntico (mismo trabajador, monto,
  fecha y descripción) dentro de 2 minutos se rechaza (409
  `DUPLICATE_DEBT`), con el trabajador bloqueado (`FOR UPDATE`) para que dos
  envíos simultáneos no pasen ambos.

### Caja: qué mueve dinero
- Registrar una deuda (de compra o manual) **no mueve Caja**: la empresa no
  soltó nada. En Caja la fila se ve (quién lo pagó, cuánto se le repuso)
  con `moves_cash: false` y no suma.
- **La reposición es el egreso** (`employee_debt_payment`): su fecha, su
  monto y su cuenta (`payment_account_id`, `null` = efectivo). Dos abonos
  desde cuentas distintas son dos salidas distintas.

### Reponer (`pay`)
- Se reparte entre las deudas PENDIENTES del trabajador, la más antigua
  primero (FIFO). Cada parte queda en `employee_debt_payment_allocation`.
- Todo en una transacción con las deudas bloqueadas (`FOR UPDATE`) y en
  céntimos enteros (sin errores de redondeo): el monto debe ser > 0 y no
  superar lo pendiente; nunca se repone de más, ni con dos reposiciones
  simultáneas.
- La cuenta debe ser de la empresa del trabajador y estar activa.

### Corregir en el lugar (solo admin; motivo 5–500 obligatorio)
Cada corrección es UNA transacción: cambia la fila, recalcula lo derivado
desde la fuente (`services/shared/debt_state.service.ts`,
`recalculateDebtsState`: paid_amount = Σ asignaciones vigentes, status,
paid_at), inserta la fila inmutable de `money_correction` (solo lo que
cambió + nombres del momento) y escribe `log`. Sin cambios → 400
`NO_CHANGES`.

- **Deuda manual** (`PUT /update/:id`): monto, descripción, categoría (misma
  regla que al crear), `incurred_at`, tienda (de la empresa; un usuario
  ligado a una tienda solo la suya) y trabajador (solo con nada repuesto,
  activo, misma empresa → si no 409 `DEBT_REIMBURSED` / 400
  `EMPLOYEE_NOT_AVAILABLE`). Monto < lo repuesto → 409
  `DEBT_BELOW_REIMBURSED` (igual = queda pagada). Anulada → 409
  `DEBT_CANCELLED`. De una compra → 409 `DEBT_FROM_PURCHASE` (se corrige
  desde la compra). No mueve Caja.
- **Reposición** (`PUT /payment/update/:id`): monto, `paid_at` (regla
  `moneyDateRule`) y cuenta (la misma se conserva aunque esté deshabilitada;
  una nueva debe ser de la empresa y activa; `null` = efectivo). El
  trabajador no (400). Anulada → 409 `REIMBURSEMENT_ANNULLED`.
  Re-reparto en céntimos (`services/shared/reimbursement_allocation.ts`,
  función pura que el front replica para la vista previa):
  - bajar: se achican SUS asignaciones desde la deuda creada más
    recientemente (LIFO); una asignación que llega a 0 se borra (la foto
    completa queda en el historial, `allocations` antes/después);
  - subir: primero se completan las deudas que ya cubre (FIFO), después las
    demás pendientes del trabajador (FIFO); más que lo pendiente → 400
    `REIMBURSEMENT_EXCEEDS_PENDING`.
  Orden de escritura pensado para los CHECK (asignación > 0, paid_amount ≤
  amount): primero asignaciones (borrar/actualizar/crear con su monto
  final), luego la reposición, al final `recalculateDebtsState`. Caja suma la
  reposición como Σ asignaciones con su fecha y cuenta, así que queda
  reflejada sola.
- **Bloqueos**: corregir/anular una reposición bloquea primero TODAS las
  deudas del trabajador (por id) y después la reposición
  (`services/shared/reimbursement_lock.service.ts`). Es el mismo orden en
  que `recalculateDebtsState` lee las reposiciones (sus subconsultas toman
  bloqueos compartidos), así no hay interbloqueo con reponer, corregir una
  deuda o una compra. Lo que se lee después del bloqueo es con `FOR UPDATE`.
- **Alcance de escritura** (`resolveWriteScope`) en crear, reponer, anular
  deuda, anular reposición y corregir: la tienda de una deuda es la de la
  cotización de su compra o, si es manual, la suya
  (`services/shared/debt_scope.service.ts`). Un usuario ligado a una tienda
  solo registra deudas en su tienda, solo repone (y re-reparte) entre deudas
  de su tienda y solo anula/corrige reposiciones que cubren deudas de su
  tienda; fuera → 404.
- **Cierre mensual de caja (fase 2)**: las deudas manuales no mueven caja:
  crearlas, corregirlas o anularlas nunca se bloquea ni deja patas, aunque
  `incurred_at` caiga en un mes cerrado. Reponer es siempre hoy (mes abierto).
  Corregir o anular una **reposición** de un mes cerrado es un **ajuste**: la
  reposición se corrige en el lugar (lo repuesto, el estado y el último abono
  de cada deuda se recalculan desde la fuente) y la diferencia en caja se
  registra con patas `hold`/`posting` por asignación (tienda de cada
  deuda/cotización) y `money_correction.kind = 'adjustment'`. Requiere
  `cash_closing.adjust.button` (403 `CASH_PERIOD_ADJUST_FORBIDDEN`).
  `PUT /employee-debt/payment/disable/:id` acepta `{ reason?: string }`
  (5–500), obligatorio solo si es ajuste (400 `ADJUSTMENT_REASON_REQUIRED`).
  Mover `paid_at` a un mes cerrado → 409 `CASH_PERIOD_CLOSED`. Respuestas con
  `kind` y `adjusted_period`.

### Anular (sigue disponible)
- **Anular una reposición**: sale de Caja y cada deuda recupera exactamente
  lo que esa reposición le cubrió (vuelve a pendiente). Es de una sola vía:
  si después sí correspondía, se registra una nueva (que vuelve a validar
  contra lo pendiente). Responde 409 si ya estaba anulada.
- **Anular una deuda manual**: solo si todavía no se le repuso nada (si no,
  409: primero se anula la reposición). Las deudas de compras no se anulan
  acá (se corrigen desde su orden de compra). Estado final `cancelled`: no
  cuenta en ningún total ni en Caja.
- Anular una reposición recalcula las deudas desde la fuente
  (`recalculateDebtsState`): una deuda que otra reposición sigue cubriendo
  completa queda "pagada" (antes quedaba "pendiente" siempre).
- Cada anulación, corrección y deuda manual dejan una fila inmutable en `log`.

### Invariantes (las cuidan los services, y la base con CHECKs)
- Suma de las asignaciones de una reposición = su monto.
- Suma de las asignaciones de reposiciones vigentes de una deuda =
  `paid_amount`, con `0 <= paid_amount <= amount`.

### Alcance
- Exclusivo de Administrador de la empresa (y Super Administrador) — un
  Gestor no tiene ningún resource de este módulo.
- Todo se filtra/valida por la empresa de la sesión (el Super Administrador
  elige la empresa al registrar una deuda manual).
- `list` filtra por `status` (`pending` por defecto, `paid`, `all`),
  `userId` y `dateFrom`/`dateTo` (sobre `incurred_at`). Las deudas anuladas
  no cuentan.

## Campos especiales
- `employee_debt.origin` (`purchase`/`manual`), `description`, `category`,
  `business_unit_id`, `incurred_at` y el estado `cancelled` se agregaron en
  `20261031100000-cash-integrity-and-reimbursements.js`; ahí también
  `purchase_order_item_purchase_id` pasó a ser opcional (las manuales no
  tienen compra).
- `employee_debt.paid_at` = fecha de la última reposición vigente (se
  recalcula al anular). `employee_debt.payment_account_id` es histórico: la
  cuenta de cada reposición vive en `employee_debt_payment`.
- Tablas `employee_debt_payment` y `employee_debt_payment_allocation`
  (misma migración), con las reposiciones hechas antes reconstruidas a
  partir de `paid_amount`, `paid_at` y la cuenta de cada deuda.
- `employee_debt.company_id` vive directo en la tabla para listar sin joins.

## Notas
- No existe una entidad "empleado" separada: el trabajador a quien se le
  debe ES un `user` (mismo criterio que `purchase_order.assigned_to`).

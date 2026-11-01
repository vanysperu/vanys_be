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

## Vistas de frontend vinculadas
- employee_debt.list (`/deudas-personal`) — "¿a quién se le debe y cuánto?",
  agrupado por trabajador, con un detalle por trabajador (pestañas Deudas y
  Reposiciones).

## Botones/acciones vinculadas
- employee_debt.pay.button — "Marcar como pagado" (reponer).
- employee_debt.create.button — "Registrar deuda" (deuda manual).
- employee_debt.disable.button — "Anular deuda" (manual, sin reposiciones).
- employee_debt.payment.disable.button — "Anular reposición".
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
- `manual`: la registra un administrador para un gasto fuera de una orden
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

### Corregir errores (siempre por anulación, nunca editando montos)
- **Anular una reposición**: sale de Caja y cada deuda recupera exactamente
  lo que esa reposición le cubrió (vuelve a pendiente). Es de una sola vía:
  si después sí correspondía, se registra una nueva (que vuelve a validar
  contra lo pendiente). Responde 409 si ya estaba anulada.
- **Anular una deuda manual**: solo si todavía no se le repuso nada (si no,
  409: primero se anula la reposición). Las deudas de compras no se anulan
  acá (se corrigen desde su orden de compra). Estado final `cancelled`: no
  cuenta en ningún total ni en Caja.
- Cada anulación y cada deuda manual dejan una fila inmutable en `log`.

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

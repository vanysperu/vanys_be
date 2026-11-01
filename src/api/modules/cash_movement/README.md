# Módulo: cash_movement (Caja)

## Código de módulo (RBAC)
`cash_movement`

## Endpoints
| Método | Ruta                       | Acción       | Requiere módulo |
|--------|----------------------------|--------------|-----------------|
| GET    | /cash-movement/list        | list (pag)   | cash_movement   |
| POST   | /cash-movement/create      | create       | cash_movement   |
| PUT    | /cash-movement/disable/:id | disable      | cash_movement   |

## Vistas de frontend vinculadas
- cash_movement.list

## Botones/acciones vinculadas
- cash_movement.create.button
- cash_movement.disable.button

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
  (`resolveTargetBusinessUnitId`, `core/rbac/businessUnitScope.ts`).
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

## Campos especiales
- `payment_account_id` (FK a `general_variable`, `SET NULL`) se agregó en
  `20261018100100-add-payment-account-to-money-movements.js`.
- `occurred_at` es `DATEONLY` (la fecha que declara el usuario, no el
  `created_at` del registro).
- `amount` es `DECIMAL(10,2)`; el tope de los validators es 99 999 999.99.

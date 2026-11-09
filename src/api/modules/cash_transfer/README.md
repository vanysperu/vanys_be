# Módulo: cash_transfer (Transferencias entre cuentas)

Pasar plata de una cuenta de la empresa a otra (banco → Yape, Efectivo → banco,
etc.). **No es ingreso ni egreso de la empresa**: solo cambia en qué cuenta está
el dinero. Antes se registraba como un egreso manual + un ingreso manual, y los
totales de ingresos/egresos de Caja, Estadísticas y el resultado del mes se
inflaban por el doble del monto (pedido explícito del usuario: "implementa
transacción entre cuentas y arregla los montos inflados").

## Código de módulo (RBAC)
Sin módulo propio: es parte de Caja (`cash_movement`). Sus resources cuelgan del
módulo `cash_movement` y de la vista `cash_movement.list`
(seeder `20261110100100-seed-cash-transfer-resources.js`).

## Endpoints
Montado en `/cash-movement/transfer` (antes que `/cash-movement`). Todas las rutas
llevan `verifyAccess` (resource por `route` + `verb`).

| Método | Ruta | Acción | Resource |
|---|---|---|---|
| GET | /cash-movement/transfer/list?page&limit&orderDir&dateFrom&dateTo(&companyId) | list (pag) | `cash_movement.transfer.list.endpoint` |
| POST | /cash-movement/transfer/create | create | `cash_movement.transfer.create.button` |
| PUT | /cash-movement/transfer/update/:id | update (corregir, motivo obligatorio) | `cash_movement.transfer.update.button` |
| PUT | /cash-movement/transfer/disable/:id | disable (anular / reactivar) | `cash_movement.transfer.disable.button` |

Cada resource se otorga a los roles que ya tienen la acción equivalente sobre un
movimiento manual (`cash_movement.create.button`, `.update.button`,
`.disable.button`, `.list.endpoint`).

### Bodies
- `POST /create`: `{ from_payment_account_id: number|null, to_payment_account_id: number|null,
  amount, occurred_at: "YYYY-MM-DD", description?, operation_number?, company_id?, business_unit_id? }`.
  `null` = Efectivo. → **201** con la transferencia.
- `PUT /update/:id`: los mismos campos, todos opcionales (ausente = no cambia) +
  `reason` (5–500, obligatorio). → **200**.
- `PUT /disable/:id`: sin body. Anula si está vigente, reactiva si está anulada. → **200**.

### Códigos de error
| Código | HTTP | Cuándo |
|---|---|---|
| `CASH_TRANSFER_SAME_ACCOUNT` | 400 | origen y destino son la misma cuenta (o los dos Efectivo) |
| `CASH_PERIOD_CLOSED` | 409 | la fecha (vieja o nueva) cae en un mes de caja cerrado |
| `CASH_TRANSFER_ANNULLED` | 409 | corregir una transferencia anulada (primero se reactiva) |
| `NO_CHANGES` | 400 | corregir sin cambiar nada |
| `PAYMENT_ACCOUNT_*` / 403 / 404 | — | cuenta de otra empresa, inexistente o deshabilitada |

## Vistas de frontend vinculadas
- `cash_movement.list` (Caja, `/caja`): las transferencias se listan ahí, mezcladas
  con el resto del dinero (filtro "Origen → Transferencia entre cuentas").

## Botones/acciones vinculadas
- `cash_movement.transfer.create.button` (botón "Transferir" en Caja)
- `cash_movement.transfer.update.button` (lápiz en la fila de una transferencia)
- `cash_movement.transfer.disable.button` (anular desde la fila)

## Reglas de negocio propias del módulo
- **Una fila, dos puntas**: sale de `from_payment_account_id` y entra a
  `to_payment_account_id` el MISMO día y por el MISMO monto. Las cuentas tienen
  que ser distintas (también un CHECK en la base) y de la empresa.
- **En Caja** (`GET /cash-movement/list`) cada transferencia aparece como dos
  filas `source = "transfer"` (salida = `expense` de la cuenta origen, entrada =
  `income` de la cuenta destino) con `transfer: { from_…, to_… }`. El resumen las
  suma en `summary.transfers` y `by_account[].transfers`, **nunca** en
  `income`/`expense`. `net = income − expense + transfers + adjustments`. En toda
  la empresa `transfers` siempre da 0; filtrando por una cuenta se ve solo su punta.
- **Estadísticas y resultado del mes** no leen `cash_transfer`: una transferencia
  no es cobro, otro ingreso ni egreso.
- **Cierre de caja**: por cuenta,
  `cierre = inicial + ingresos − egresos + transferencias + ajustes`
  (`cash_period_balance.transfers` + CHECK de la base). Saldos actuales y la pista
  del saldo inicial también las incluyen.
- **Mes cerrado**: una transferencia de un mes cerrado no se crea, corrige ni anula
  (409 `CASH_PERIOD_CLOSED`); se reabre el mes. A diferencia de un pago o un gasto,
  no genera patas de ajuste: no cambia lo que tiene la empresa. Cambios que no
  mueven saldos (descripción, N.° de operación) sí se permiten.
- **Alcance**: empresa y tienda salen de la sesión (`resolveTargetCompanyId`,
  `resolveWriteScope`). Crear/corregir/anular usan el alcance de ESCRITURA (un
  gestor solo en su tienda); listar, el de LECTURA. Fuera de alcance = 404.
- **Trazabilidad**: crear, corregir (con "antes → ahora" y motivo), anular y
  reactivar escriben una fila inmutable en `log` (`module = "cash_transfer"`) en la
  misma transacción. Sin historial en `money_correction` (no tiene patas de
  ajuste ni badge "Corregido").
- **disable** es soft-delete (`is_deleted`), nunca DELETE.
- Una cuenta usada en una transferencia no se elimina (409 `PAYMENT_ACCOUNT_IN_USE`).

## Campos especiales
- `occurred_at` DATE (día de Lima, nunca futuro, mismas reglas que todo el dinero).
- `amount` DECIMAL(10,2) > 0, máximo 2 decimales.
- Auditoría `created_*`/`updated_*` en UTC; en las respuestas salen como
  `{ date, time }` de Lima.
- Índices: `(company_id, occurred_at)`, `business_unit_id`, cuentas, `created_at`.

## Corregir registros viejos (egreso + ingreso manual que eran una transferencia)
`scripts/convert-movements-to-transfer.js`: anula el par de movimientos manuales
(con log) y crea la transferencia equivalente, en una transacción. Por defecto
solo muestra lo que haría (`--apply` para escribir). Los saldos por cuenta no
cambian; los ingresos/egresos de la empresa dejan de estar inflados.

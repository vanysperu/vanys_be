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
- El listado es **mixto**: combina los movimientos manuales de esta tabla
  con los pagos y gastos que ya registran otros módulos. Solo las filas con
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

## Campos especiales
- `occurred_at` es `DATEONLY` (la fecha que declara el usuario, no el
  `created_at` del registro).
- `amount` es `DECIMAL(10,2)`; el tope de los validators es 99 999 999.99.

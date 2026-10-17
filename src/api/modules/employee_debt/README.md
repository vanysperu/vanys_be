# Módulo: employee_debt

## Código de módulo (RBAC)
`employee_debt`

## Endpoints
| Método | Ruta                        | Acción             | Requiere módulo |
|--------|-----------------------------|--------------------|-----------------|
| GET    | /employee-debt/list         | list (pag, agregado por trabajador) | employee_debt |
| PUT    | /employee-debt/pay/:userId  | saldar (liquida TODA la deuda pendiente de ese trabajador) | employee_debt |

La deuda en sí nunca se crea desde un endpoint de este módulo: nace
automáticamente dentro de `purchase_order` (ver
`purchase_order/services/create/purchase_order_item_purchase.service.ts`)
cuando se registra una compra con `funding_source: "employee"`.

## Vistas de frontend vinculadas
- employee_debt.list (`/deudas-personal`) — "¿a quién se le debe y cuánto?",
  agrupado por trabajador.

## Botones/acciones vinculadas
- employee_debt.pay.button ("Marcar como pagado" — liquida de una vez todas
  las compras pendientes de ese trabajador, con `ConfirmDialog` porque es
  irreversible).

## Reglas de negocio propias del módulo
- Pedido explícito del usuario: al registrar una compra de una orden de
  compra, el toggle "¿con qué plata se pagó?" decide el flujo:
  - `company` (plata de la empresa) → flujo normal, nada cambia.
  - `employee` (plata propia) → se crea una fila en `employee_debt`
    (`status: "pending"`) a nombre de quien puso el dinero
    (`paid_by_user_id`, por defecto quien registra la compra; un admin
    puede registrarla en nombre de otro trabajador pasando
    `paid_by_user_id` explícito).
- Una fila de `employee_debt` por compra (`purchase_order_item_purchase_id`
  es `UNIQUE`) — nunca se acumula a mano, el listado agrega con
  `SUM(amount) WHERE status='pending' GROUP BY user_id`.
- "Marcar como pagado" liquida **TODA** la deuda pendiente de ese
  trabajador de una sola vez (no compra por compra) — no tiene sentido
  marcarlas una por una si lo que se le devuelve es el total acumulado.
- Exclusivo de Administrador de la empresa (y Super Administrador) — un
  Gestor no tiene ningún resource de este módulo otorgado, ni siquiera de
  solo lectura: es una vista financiera de gestión, no una tarea operativa
  del día a día.

## Campos especiales
- `employee_debt.company_id` vive directo en la tabla (no solo derivado vía
  la compra) para poder listar/filtrar "a quién se le debe" sin un join de
  3 tablas en cada consulta — se setea desde `purchase_order.company_id` al
  crear la deuda.
- Tabla creada en la migración `20261011100200-create-employee-debt.js`;
  `purchase_order_item_purchase.funding_source`/`paid_by_user_id` se
  agregaron en `20261011100100-add-funding-source-to-purchase-order-item-purchase.js`.

## Notas
- No existe una entidad "empleado" separada: el trabajador a quien se le
  debe ES un `user` (mismo criterio que `purchase_order.assigned_to`).

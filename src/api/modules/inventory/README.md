# Módulo: inventory (Almacenes e inventario)

Sprint 2, ítem 2. Pedido del usuario: almacenes por tienda (activar y
desactivar), "maneja stock" por producto (los intangibles no), stock negativo,
lotes y vencimiento por almacén, ingresos, salidas, transferencias e historial
(kardex). Plan §8. Decisiones: D2 (stock por producto + color), D3 (costo
promedio ponderado por empresa), D4 (la venta descuenta al entregar o al emitir
la guía, por tienda), D5 (lotes y negativo no van juntos), D14 (los productos
existentes arrancan sin manejar stock; los nuevos, con).

## Código de módulo (RBAC)
`inventory` (id preferido 26). Seeder: `20261114120100-seed-inventory-module.js`.
Además del rol, la empresa tiene que tener la funcionalidad `inventory`
(`company_feature`): sin ella todo responde 403 `FEATURE_DISABLED`.

## Activación (3 niveles)
1. Empresa: el Super Administrador prende `inventory` (Empresas → Funcionalidades).
2. Tienda: `business_unit.inventory_enabled` ("Usa almacén") e
   `inventory_exit_on` (`delivered` | `dispatch_guide`).
3. Almacén: cada tienda tiene uno o varios; se deshabilitan solo sin stock y sin
   transferencias en tránsito.

## Endpoints
| Método | Ruta | Acción | Recurso |
|--------|------|--------|---------|
| GET  | /inventory/warehouses | listar almacenes (paginado) | `inventory.warehouses.list.endpoint` |
| POST | /inventory/warehouses | crear (201) | `inventory.warehouses.create.button` |
| PUT  | /inventory/warehouses/:id | configurar | `inventory.warehouses.update.button` |
| PUT  | /inventory/warehouses/:id/disable | deshabilitar / habilitar | `inventory.warehouses.disable.button` |
| GET  | /inventory/stores | tiendas con su configuración | `inventory.stores.endpoint` |
| PUT  | /inventory/stores/:id | "usa almacén" y cuándo descuenta la venta | `inventory.stores.update.button` |
| PUT  | /inventory/products/tracks-stock | "maneja stock" en bloque | `inventory.products.tracksStock.button` |
| GET  | /inventory/stock | stock por producto/color, por almacén y total | `inventory.stock.endpoint` |
| GET  | /inventory/stock/by-products | stock propio de hasta 100 productos (cotización) | `inventory.stock.byProducts.endpoint` |
| GET  | /inventory/kardex | movimientos con saldo acumulado | `inventory.kardex.endpoint` |
| GET  | /inventory/lots/suggest | lotes con stock, FEFO | `inventory.lots.endpoint` |
| GET  | /inventory/documents | documentos (paginado, filtros) | `inventory.documents.list.endpoint` |
| GET  | /inventory/documents/:id | detalle | `inventory.documents.find.endpoint` |
| POST | /inventory/documents | crear borrador (201) | `inventory.documents.create.button` |
| PUT  | /inventory/documents/:id | editar borrador | `inventory.documents.update.button` |
| POST | /inventory/documents/:id/post | confirmar ingreso, salida o ajuste | `inventory.documents.post.button` |
| POST | /inventory/documents/:id/dispatch | despachar transferencia | `inventory.transfers.dispatch.button` |
| POST | /inventory/documents/:id/receive | recibir (todo o parte) | `inventory.transfers.receive.button` |
| POST | /inventory/documents/:id/cancel | anular | `inventory.documents.cancel.button` |

"Ver costos" es el recurso `inventory.costs.view.button` (`GET /inventory/costs`,
sin pantalla): sin él, los costos salen en `null`.

## Vistas de frontend vinculadas
`inventory.stock.view` (/inventario/stock), `inventory.documents.view`
(/inventario/documentos), `inventory.kardex.view` (/inventario/kardex),
`inventory.warehouses.view` (/inventario/almacenes). Menú: grupo "Inventario".

## Quién recibe qué (seeder)
- Operar (stock, kardex, documentos, confirmar, despachar, recibir): quien ve
  cotizaciones (`cotizacion.list`), Gestor incluido.
- Configurar (almacenes, tiendas, maneja stock) y anular documentos
  confirmados: `producto.create.button` (Administrador).
- Ver costos: `payment.update.button`.

## Alcance (CLAUDE.md §11.1)
Un usuario atado a una tienda opera solo los almacenes de su tienda; "ver todas
las tiendas" amplía la lectura, nunca la escritura. En una transferencia
despacha quien opera el origen y recibe quien opera el destino.

## Tablas (migración 20261114120000)
`warehouse`, `document_series`, `stock_lot`, `stock_document`,
`stock_document_line`, `stock_movement` (libro inmutable), `stock_balance`
(saldo por almacén + producto + color + lote, único) y `stock_cost` (promedio
por empresa). Todas con auditoría y `company_id`.

**Color por nombre**: el stock se lleva por `color_key` (nombre del color; `''`
= sin color) y no por id, porque guardar un producto recrea sus colores y la
cotización guarda el color como texto. Quitar (o renombrar) un color con stock
responde 409 `COLOR_HAS_STOCK`. Las claves de saldo no usan NULL
(`color_key ''`, `lot_key 0`) para que el índice único funcione.

## Reglas de negocio
- **Motor** (`services/shared/stock_engine.ts`): libro y saldos en la misma
  transacción del documento; los saldos se bloquean (`SELECT … FOR UPDATE`) en
  orden fijo (almacén, producto, color, lote), así no hay carreras ni bloqueos
  cruzados. Sin negativo permitido, responde 409 `INSUFFICIENT_STOCK` con el
  detalle (`errors.lines`: producto, color, almacén, disponible y pedido).
- **Costo (D3)**: promedio ponderado por producto y color a nivel empresa, en
  cada entrada con costo. Las salidas se valorizan al promedio vigente.
- **Documentos**: borrador → confirmado → anulado. Lo confirmado nunca se
  edita: se anula con un documento inverso (motivo `reversal`, otro número,
  visible en el kardex). Una transferencia: borrador → despachada → recibida /
  recibida parcial; se anula solo en borrador.
- **Numeración**: series `NI01`, `NS01`, `TR01`, `AJ01` por empresa, con la fila
  de `document_series` bloqueada (sin saltos ni duplicados).
- **Tránsito**: despachar resta del origen y suma al almacén virtual "En
  tránsito" de la empresa (mismo lote); recibir lo pasa al destino. Lo que no
  llega queda pendiente, o con `closeDifference` se da por perdido (queda en el
  kardex del almacén de tránsito).
- **Lotes**: un almacén con lotes no permite negativo (D5) y "controla
  vencimiento" exige lotes. Al ingresar se usa el código indicado o se genera
  uno; un producto perecible pide vencimiento (`LOT_EXPIRY_REQUIRED`). Al
  sacar sin lote elegido se reparte por FEFO; con `block_expired`, un lote
  vencido no sale (`LOT_EXPIRED`).
- **Venta (D4)**: al marcar una cotización como Entregada (tienda con
  `inventory_exit_on = delivered`), sale el stock del almacén predeterminado de
  su tienda, dentro de la misma transacción. Si no alcanza, la salida queda en
  borrador (no se frena la entrega) y se avisa a quien entregó. No descuenta dos
  veces si la cotización vuelve a Entregada.
- **Compras**: `POST /purchase-order/...` acepta `warehouse_id` ("Ingresar al
  almacén"): crea un ingreso confirmado con costo = monto ÷ cantidad.
- **Avisos**: lotes por vencer (según `expiry_alert_days` del almacén), una vez
  por día, a quienes configuran almacenes, desde `POST /internal/jobs/tick`.
- **Maneja stock**: apagarlo en un producto con stock responde 409
  `PRODUCT_HAS_STOCK`.

## Pendiente (siguiente sprint, plan §8)
Stock mínimo con aviso, reservas por cotización, tomas de inventario,
ubicaciones, plantilla de carga inicial, exportar el kardex a Excel/PDF y los
formatos PLE 12.1/13.1. La salida al emitir la guía (D4, `dispatch_guide`) se
conecta con el ítem 1 (GRE).

## Pruebas
`tests/inventory.test.ts` (D5, D14, costo promedio, dos salidas simultáneas,
transferencia con tránsito y recepción parcial, anulación y kardex, lotes FEFO
y aviso de vencimiento, salida al entregar, alcance del Gestor).

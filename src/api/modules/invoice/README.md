# Módulo: invoice (Facturas)

Pedido explícito del usuario: tener mapeadas todas las facturas, las que
**emitimos** al cerrar una cotización y las que **pedimos** al comprar, con su
foto o PDF, y una lista de las que **faltan subir**.

## Código de módulo (RBAC)
`invoice` (seeder `20261107100100-seed-invoice-module.js`).
- Pantalla y reintentos: roles administradores (`payment.update.button`).
- Subir y ver el archivo: además quien registra compras
  (`purchase_order.item.registerPurchase.button`) y quien cambia el estado de
  una cotización (`cotizacion.changeStatus.button`), Gestor incluido.
- Elegir una factura ya registrada al comprar: quien registra compras y los
  roles administradores (seeder `20261108100100-seed-invoice-purchase-candidates.js`).
- Compras sin factura (Sprint 2, ítem 3, seeder `20261115100100-seed-purchase-invoice-link-resources.js`):
  bandeja, vincular, quitar compra y datos de la factura, para quien registra compras
  y los roles administradores. Quien registra compras (Gestor incluido) recibe también
  la vista Facturas y su listado, siempre limitados a su tienda.

## Endpoints
| Método | Ruta                         | Acción                                  | Recurso RBAC                 |
|--------|------------------------------|-----------------------------------------|------------------------------|
| GET    | /api/invoice/list            | list (pag) + resumen de pendientes      | invoice.list.endpoint        |
| GET    | /api/invoice/purchase-candidates?itemId=&search= | facturas de compra a las que se puede sumar la compra de ese item (máx. 20) | invoice.purchaseCandidates.endpoint |
| POST   | /api/invoice/:id/file        | subir/reemplazar archivo (multipart `file`) | invoice.file.upload.button |
| GET    | /api/invoice/:id/file        | el archivo (privado, solo con sesión)   | invoice.file.view.button     |
| PUT    | /api/invoice/:id/drive-retry | reintentar la copia a Google Drive      | invoice.drive.retry.button   |
| GET    | /api/invoice/pending-purchases | bandeja "Compras sin factura" (pag) + `summary.pending_count` | invoice.pendingPurchases.endpoint |
| POST   | /api/invoice/link-purchases  | UNA factura para varias compras (nueva con sus datos, o `invoice_id` ya registrada); JSON o multipart con `file` opcional | invoice.link.button |
| PUT    | /api/invoice/:id/remove-purchase | quitar una compra (vuelve a la bandeja) | invoice.removePurchase.button |
| PUT    | /api/invoice/:id/details     | proveedor, serie-número, fecha de emisión, moneda y total | invoice.details.button |

Las facturas se **crean** en otros flujos:
- `POST /purchase-order/item/:itemId/purchases` con `has_invoice: true` → factura de
  compra (responde `invoice_id`). Con `invoice_id`, en vez de crear una nueva, la
  compra se suma a esa factura ya registrada.
- `PUT /quotation/status/:id` a `finished` con `invoice_issued: true` → factura
  emitida (responde `invoice_id`).
El archivo se sube después con `POST /invoice/:id/file`; si no se sube, la
factura queda en "Faltan subir" (`file=pending`).

Filtros del listado: `type` (issued|purchase), `file` (pending|uploaded),
`drive` (none|pending|copied|failed), `supplierId`, `search` (cualquiera de sus
productos o cotizaciones, la descripción, la serie-número o el proveedor), `dateFrom`/`dateTo`, `companyId` (solo Super
Administrador).
`summary`: `pending_count` y `drive_failed_count` con los mismos filtros, y
`pending_purchases_count` (compras con la factura pendiente, contador de la pestaña).

Filtros de la bandeja: `includeNotRequired` (también las que no llevan factura),
`storeId` (afina dentro del alcance del usuario), `quotationId`, `search` (producto,
cotización o cliente), `dateFrom`/`dateTo` (fecha de la compra). Las compras
anuladas nunca aparecen. Las compras no guardan proveedor: el proveedor es dato
de la factura.

## Vistas de frontend vinculadas
- `invoice.list` → `/facturas` (grupo Finanzas).

## Botones/acciones vinculadas
- `invoice.file.upload.button`, `invoice.file.view.button`, `invoice.drive.retry.button`
- `invoice.link.button` ("Registrar factura" en la bandeja, "Vincular factura" en cada compra, "Agregar compras" en la factura)
- `invoice.removePurchase.button` ("Quitar compra"), `invoice.details.button` (datos de la factura)

## Reglas de negocio propias del módulo
- **Una factura, varias compras** (pedido explícito del usuario: "en una factura
  pueden estar varios productos"): el vínculo está en `invoice_purchase` (una
  factura → N compras; cada compra, a lo sumo en una factura). Al registrar una
  compra se elige "Factura nueva" o "Va en una factura ya registrada". La factura
  elegida tiene que ser de compra, de la misma empresa y de la misma tienda que
  la compra (`400 INVOICE_NOT_LINKABLE`, y la compra no se registra); puede ser
  de otra cotización. Un solo archivo cubre todas sus compras: "Faltan subir"
  cuenta facturas, no compras.
- Una compra anulada sale del detalle de su factura y deja de contar en el IGV;
  la factura sigue, con sus demás compras.
- **Factura sin compras** (`services/shared/purchase_invoice_link.ts`): si quedan
  compras, la factura se reapunta a la primera que queda. Si no queda ninguna, al
  anular se elimina solo si no tiene archivo; al corregir la compra (quitar o mover
  la factura) y al resetear la cotización se elimina también con archivo. La copia
  en Drive se conserva siempre.
- **Archivo**: foto (el navegador la convierte a WEBP, legible y liviana) o PDF,
  máx. 5 MB; se valida la firma real del archivo. Nunca tiene URL pública: se
  ve solo con sesión.
- **Dónde se guarda** (por empresa, lo decide SOLO el Super Administrador en
  Empresas, `company.invoice_storage_system` / `invoice_storage_drive`):
  - Sistema: en la base (`invoice_file`), no en el disco del hosting (un
    despliegue nuevo no lo borra).
  - Sistema + Drive: se guarda en el sistema y se copia a Drive por detrás. Si
    Drive falla (sin espacio, permiso revocado...), la factura no se pierde:
    queda `drive_status = failed` con el motivo, se avisa en la campana (a quien
    la subió y a los Super Administradores, una vez) y se reintenta sola cada
    10 minutos con espera creciente (máx. 8 intentos; luego "Reintentar").
  - Solo Drive: se sube primero a Drive; si falla, no se guarda nada y se
    responde el motivo (`502 DRIVE_UPLOAD_FAILED`, `409 DRIVE_NOT_CONNECTED`).
  - Ninguno activo: `409 INVOICE_STORAGE_DISABLED`.
- **Nunca se borra nada en Drive** (pedido explícito del usuario): reemplazar
  el archivo sube uno nuevo y deja el anterior allá.
- Carpetas en Drive: `Facturas - <empresa> / 2026 / 11 - Noviembre / Emitidas|Compras`.
- Alcance: empresa del usuario; un usuario atado a una tienda ve las de su
  tienda. Otra empresa responde 404.

- **Compras sin factura (Sprint 2, ítem 3)**: cada compra tiene `invoice_status`
  (`linked` | `pending` = la factura llega después | `not_required`). Vincular no pide
  motivo ni pasa por "Corregir compra" (no mueve dinero): queda como evento
  `purchase_invoice_linked` / `purchase_invoice_unlinked` en el historial de cada
  cotización, nunca en `money_correction`. Todo el vínculo va en una transacción: si
  una compra no se puede vincular (anulada, ya en otra factura, de otra tienda o
  empresa), no queda ninguna vinculada ni la factura creada.
- **Archivo en el mismo paso**: `link-purchases` guarda el archivo enseguida con las
  mismas reglas de "Subir archivo". Si ese paso falla (por ejemplo, Drive sin
  conectar), la factura queda registrada sin archivo, en "Faltan subir", y la
  respuesta lo dice (`file_uploaded: false`, `file_error`): el vínculo no se pierde.
- **Varias tiendas (D8)**: un admin de empresa (sin tienda) puede juntar compras de
  varias tiendas; la factura queda con `business_unit_id = NULL`. Un usuario atado a
  una tienda solo vincula compras de su tienda y solo a facturas de su tienda (el
  permiso "ver todas las tiendas" es de lectura: no amplía esto).
- **Factura repetida**: misma empresa + proveedor + serie-número responde
  `409 INVOICE_DUPLICATE_NUMBER`; con `allow_duplicate: true` se registra igual.
- **Quitar compra**: la compra vuelve a `pending`. Si la factura se queda sin compras,
  se elimina solo si no tiene archivo (misma regla que al anular).

## Campos especiales
- `invoice.file_name IS NULL` = falta subir el archivo.
- `invoice.supplier_id`, `series_number` (normalizado: `F001-123`), `issue_date`,
  `currency` (PEN|USD), `total`: opcionales (D9), migración
  `20261115100000-purchase-invoice-status.js`.
- `invoice.quotation_id` es la cotización de la primera compra. El listado trae
  `quotation_codes` (todas), `purchases` (producto, cantidad, monto y cotización de
  cada compra vigente) y `purchases_total`; en una factura de compra `description`
  se arma con esas compras (`invoice.description` guarda el texto de la primera y
  queda de respaldo si se anulan todas).
- Fechas `created_at`/`file_uploaded_at` salen como `{ date, time }` (Lima).

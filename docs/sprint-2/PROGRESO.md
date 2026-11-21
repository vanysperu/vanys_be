# Sprint 2 — Progreso

> Bitácora para retomar el trabajo si la sesión se corta. Plan completo:
> [PLAN-SPRINT-2.md](PLAN-SPRINT-2.md).

## Entorno (listo, 12-nov-2026)

- Worktrees en la rama `feature/sprint-2`:
  - `C:\Extensiones\vn\sprint2\grulla_be` (desde v1.6.1)
  - `C:\Extensiones\vn\sprint2\grulla_fe` (desde v0.6.1)
- Base `grulla_s2_dev`: copia de `grulla_dev` (48 tablas). El mismo MySQL tiene `gs` y `nasa_dev`,
  que son de otros proyectos: no se tocan.
- Puertos: backend 4760 (`.env` → `PROY_APP_PORT=4760`, `PROY_BD=grulla_s2_dev`); frontend 4260
  (`npm run dev -- --port 4260`, `.env` → `VITE_API_URL=http://localhost:4760/api`).
- Tests contra el sprint: `API_BASE_URL=http://localhost:4760 npx jest <archivo>`.
- Migraciones y seeders: `npx sequelize-cli db:migrate` y `npx sequelize-cli db:seed --seed <archivo>`,
  desde el worktree (lee su `.env`).
- La otra sesión (vn-ce) está avisada de los worktrees, la base y los puertos.

## Orden acordado

entorno → base común → 4 (contraseñas y correo) → 7 + 8 (compartir cotización + fix del
formulario) → 5 (kanban) → 9 (formularios de cliente y producto) → 6 (stock de proveedores) → 2
(almacenes) → 3 (compras sin factura) → 1 (GRE) → QA y release.

La base común se hace justo antes del primer ítem que la necesita.

## Hecho

| Fecha | Repo | Commit | Qué |
|---|---|---|---|
| 12-nov | grulla_be | `fdd5b09` | Cola de correos (Brevo/consola), cupo diario con avisos, enlaces de invitación y recuperación, eliminación de `/recovery/*` y de `recovery_code`, usuarios nuevos sin `123456`, `POST /user/:id/password-link`, `POST /internal/jobs/tick` |
| 12-nov | grulla_be | `ddb10da` | Suite `password-links` (9 pruebas), helpers de pruebas sin `123456` (`activateInvitedUser`), sin límite por IP para localhost en desarrollo, README de auth, email y users, variables nuevas en `.env.example` |
| 12-nov | grulla_fe | `6cf8b2b` | Login con "¿Olvidaste tu contraseña?", pantallas `/recuperar-contrasena`, `/restablecer-contrasena`, `/activar-cuenta`, `AuthBrandLayout`, diálogo de enlaces en Usuarios (copiar / WhatsApp), `CopyableLinkField`, `lib/whatsapp.ts`, e2e `password-links` y `users` actualizados, `E2E_PORT` en Playwright |

**Ítem 4 terminado.** Pruebas: jest `password-links`, `production-readiness`, `cash-movement-correction`,
`purchase-expense-correction` y `cash-closing-adjustments-2` en verde; e2e `password-links`, `users` y
`login` en verde (puerto 4260/4760).

Pendiente para el release (no bloquea):
- Guía de despliegue: variables nuevas, cron `/internal/jobs/tick` cada 10 min, y quitar el texto de
  "nace con la contraseña temporal 123456".
- `scripts/package-release.js`: agregar `APP_PUBLIC_URL` y `EMAIL_*` a `variables-entorno.env`.

Para correr los e2e contra el sprint: `E2E_PORT=4260 E2E_API_URL=http://localhost:4760/api npx playwright test <spec>`.

| 12-nov | grulla_fe | `41d2ed3` | Ítem 8: filas de Nueva cotización alineadas por arriba (e2e compara la altura de las etiquetas; sin el arreglo detectaba 16,5 px) |
| 12-nov | grulla_be | `aae0a99` | Ítem 7 backend: `quotation_public_link`, `/api/public/q/:code` (+ `/pdf`), interruptor, enlace nuevo, WhatsApp y correo con PDF (plantilla `quotation`, remitente "Empresa vía Vanys"), eventos en el historial, `quotation_branding.ts` compartido con el PDF, recursos `cotizacion.publicLink.*` / `cotizacion.share.*` |
| 12-nov | grulla_fe | `37cbf36` | Ítem 7 frontend: página `/c/:code`, diálogo "Compartir con el cliente" (interruptor, enlace, WhatsApp, correo), historial, `ToggleSwitch`, `lib/money`, e2e `quotation-share` |
| 12-nov | grulla_be | `ac3e5b1` | Suite `quotation-share` (9 pruebas) y README de quotation |

**Ítems 7 y 8 terminados.** jest `quotation-share` en verde; e2e `quotation-share` y
`quotation-form-fields` en verde.

| 13-nov | grulla_be | `2440e57` | Ítem 5 backend: `production_workflow`, `production_workflow_stage`, `quotation_item_stage_log`; migración de las etapas de `general_variable` (803 empresas, 0 huérfanos, ida y vuelta probada), `GET/PUT /production-workflow/config`, `GET /production-workflow/board`, reglas lineal/libre, módulo RBAC `production_workflow` (recursos 270–273), suite `production-workflow` |
| 13-nov | grulla_fe | `916b3fc` | Ítem 5 frontend: pantalla Configuración → Flujo de producción, kanban con las columnas y reglas de la empresa, e2e `production-workflow` |

**Ítem 5 terminado.** jest `production-workflow`, `quotation-active-rules`, `quotation-edit`,
`quotation-reset`, `web-quote-request`, `quotation-board`, `rbac`, `flow-guards` y
`variable-general-global-scope` en verde; e2e `production-workflow`, `navigation-smoke` y
`variable-general` en verde. En `quotations` falla "crear una orden de compra" porque el selector
"Asignado a" carga 100 usuarios y la empresa QA ya tiene 206 (límite conocido, no es del ítem 5).

Notas para el release:
- La migración `20261113120000` reescribe `quotation_item.stage_id` y su FK: ensayarla en la copia
  temporal de producción antes del despliegue.
- El ingreso a la primera columna no se registra en `quotation_item_stage_log` (su hora es
  `quotation_item.created_at`).

## Agregado al sprint (13-nov)

- **Ítem 9** (pedido del usuario): los diálogos de nuevo cliente y nuevo producto en Nueva cotización
  deben ser iguales a los de los módulos Clientes y Productos. Va después del ítem 5.

| 13-nov | grulla_fe | `0497350` | Ítem 9: `ClientFormDialog`, `ProductFormDialog` y `TechniqueFormDialog` compartidos entre los módulos y el "+" de Nueva cotización (se borran los diálogos rápidos); el submit del diálogo ya no envía la cotización; `noValidate` en la cotización; arreglo de diseño de "Invitación lista" |

**Ítem 9 terminado.** También la técnica de personalización (mismo "+", misma regla de consistencia).
Hallazgos al probar:
- Antes, crear un producto, cliente o técnica con el "+" también disparaba el envío de la cotización
  (el submit se propagaba por el árbol de React). Arreglado con `stopPropagation`.
- "Invitación lista" (ítem 4) partía el texto del correo en columnas y sacaba los botones del
  diálogo con correos largos. Arreglado.
- e2e en verde: `quotation-form-fields` (con la prueba nueva del ítem 9), `clients`, `products`,
  `edit-forms-prefill`, `users`, `payments`, `product-customization`, `flow-guards`,
  `receivables-reminders`. Fallan por datos (no por el sprint) las que eligen "Ana Acme" en
  "Asignado a": la empresa QA tiene 206 usuarios y el selector carga 100 (`employee-debts`,
  `requested-changes`, `quotations` → orden de compra).

| 13-nov | grulla_be | `1e4bfb0` | Base común: `company_feature` (+ `/company-feature/:companyId`, `features` en `/access/me`, `requireCompanyFeature`), módulo Proveedores (`/supplier/*`, RBAC 274–280), `product_code.supplier_id` con código único por proveedor (D6; 56 proveedores creados desde el texto, 58 códigos enlazados), suite `supplier` |
| 13-nov | grulla_fe | `144e61d` | Pantalla Proveedores, Empresas → Funcionalidades, proveedor como selector en los códigos de producto, e2e `suppliers` |

**Base común (proveedores y funcionalidades) terminada.** jest `supplier`, `public-products-bulk`
(actualizada a D6) y las de productos en verde; e2e `suppliers`, `products`, `edit-forms-prefill`,
`platform` y `navigation-smoke` en verde.

Notas para el release:
- La FK `product_code.supplier_id` es RESTRICT (MySQL no admite SET NULL en la base de una columna
  generada; los proveedores no se borran).
- Las integraciones que mandan `codes[].supplier` como texto siguen funcionando: se busca o se crea
  el proveedor por nombre.

| 13-nov | grulla_be | `e047886` | Ítem 6 backend: `supplier_stock_source/_import/_item`, `product_code.code_norm` y `product.sku_norm` (generadas, indexadas), fuentes por enlace cifrado o archivo, "Probar", descarga segura (SSRF), SheetJS 0.20.3 en `worker_thread`, reemplazo atómico, `/supplier-stock/lookup` y `/search`, job en `tick`, RBAC 281–290, suites `supplier-stock` y `supplier-stock-parsing` |
| 13-nov | grulla_be | `0f346cc` | La búsqueda de stock devuelve el nombre de cada fuente |
| 13-nov | grulla_fe | `a6ea37b` | Pantalla Stock de proveedores (Stock + Fuentes con "Probar", subir, historial) y línea de stock por producto en Nueva cotización, e2e `supplier-stock` |

**Ítem 6 terminado con datos de prueba.** jest `supplier-stock` (8) y `supplier-stock-parsing` (7)
en verde; e2e `supplier-stock` en verde. SheetJS CE 0.20.3 instalada desde su CDN y registrada en
CLAUDE.md.

Falta con los Excel reales del usuario: probar sus formatos y agregar las reglas propias de cada
proveedor en `supplier_stock/services/shared/stock_parsing.ts` (ej. código con el color pegado,
otros textos de cantidad). Para el release: el `.env` de producción necesita `CRON_SECRET` para que
el cron actualice las fuentes por enlace (el del sprint no lo tiene, el `tick` no se probó por HTTP).

| 13-nov | grulla_be | `e0fb003` | Ítem 2: esquema (warehouse, document_series, stock_lot, stock_document(_line), stock_movement, stock_balance, stock_cost), motor de movimientos con bloqueo en orden fijo y costo promedio por empresa |
| 13-nov | grulla_be | `53f1f13` | Ítem 2: almacenes, tiendas, maneja stock, documentos NI/NS/TR/AJ, transferencias con tránsito y recepción parcial, anulación inversa, lotes FEFO y vencimiento, kardex, stock por producto, salida al marcar Entregada, ingreso desde compras, aviso de lotes por vencer, RBAC 291–314, suite `inventory` |
| 13-nov | grulla_fe | `8afd686` + `45b39b1` | Ítem 2: menú Inventario (Stock, Movimientos, Kardex, Almacenes), Maneja stock / Perecible en el producto, stock propio en Nueva cotización, e2e `inventory` |

**Ítem 2 terminado.** jest `inventory` (10) en verde, más 117 pruebas de regresión (cotizaciones,
compras, facturas, productos, RBAC); e2e `inventory` en verde; `npm run build` de ambos repos en
verde. Decisión de diseño: el stock va por producto + **nombre** de color (los colores se recrean al
guardar el producto y la cotización guarda el color como texto); quitar un color con stock da 409.

Pendiente del ítem 2 para un sprint posterior (plan §8): stock mínimo con aviso, reservas, tomas de
inventario, plantilla de carga inicial, exportar kardex a Excel/PDF, PLE 12.1/13.1, y elegir el
almacén al registrar una compra desde la pantalla (el backend ya acepta `warehouse_id`). La salida al
emitir la guía (`dispatch_guide`) se conecta en el ítem 1.

## Segunda PC (13-nov-2026)

- El sprint sigue en otra PC (usuario de Windows `workj`), con las mismas rutas
  (`C:\Extensiones\vn\...`). La base `grulla_s2_dev` se importó del paquete
  (`base\grulla_s2_dev.sql`, 68 tablas) y se corrió `npm run db:seed-qa`. Ese MySQL tiene
  además `emove_dev`, `vanys` y `vanys_dev`, que no son del sprint: no se tocan.
- Playwright necesitó `npx playwright install chromium` (r1248).
- Al revisar el entorno fallaban 2 pruebas que se habían quedado desactualizadas (no el código):
  arregladas en `grulla_be` `8bfef21` (`supplier.test.ts` ya no asume una sola
  funcionalidad) y `grulla_fe` `ec0af1f` (`suppliers.spec.ts` busca "Proveedores" exacto).
- **Push bloqueado:** en esta PC Git usa la cuenta de GitHub `carupano2026`, que no tiene
  permiso de escritura en `vanysperu/vanys_be` ni `vanys_fe` (403). Los commits quedan locales
  hasta que el usuario dé acceso a esa cuenta o inicie sesión con la correcta.

| 13-nov | grulla_be | `36fe12c` | Ítem 3 backend: `purchase_order_item_purchase.invoice_status` (linked/pending/not_required, con backfill: 144 linked), datos opcionales de la factura (proveedor, serie-número, fecha, moneda, total) y aviso de factura repetida, "Sí, llega después" (`invoice_pending`), `GET /invoice/pending-purchases`, `POST /invoice/link-purchases` (una factura para varias compras, nueva o ya registrada, archivo en el mismo paso, una transacción), `PUT /invoice/:id/remove-purchase`, `PUT /invoice/:id/details`, eventos en el historial, RBAC 315–318, suite `purchase-invoice-pending` (11) |
| 13-nov | grulla_be | `81127a1` | El detalle de la cotización trae `purchase_invoice_status` (Gastos → Vincular factura) |
| 13-nov | grulla_fe | `6140b47` | Ítem 3 frontend: tres respuestas al registrar la compra, Facturas → "Compras sin factura" (contador, filtros, selección múltiple, "Registrar factura"), "Vincular factura" en la orden y en Gastos, diálogo de la factura (datos, quitar y agregar compras), número y proveedor en la tabla, e2e `purchase-invoices` |

**Ítem 3 terminado.** jest `purchase-invoice-pending` (11) en verde, más 117 de regresión
(facturas, compras, correcciones, reset, inventario, RBAC, proveedores, flow-guards) y
`quotation-edit`; e2e `purchase-invoices` (el Gestor registra con "llega después" y crea una
sola factura para dos compras desde la bandeja) y 43 de regresión (`navigation-smoke`,
`flow-guards`, `payments`, `inventory`, `quotation-form-fields`, `edit-forms-prefill`,
`suppliers`) en verde; `tsc` y `npm run build` de ambos repos en verde; migración y seeder
probados de ida, vuelta e ida.

Decisiones tomadas al implementar (revisar si no convencen):
- **El Gestor ve Facturas:** para que resuelva sus compras pendientes desde la bandeja (lo pide el
  criterio de "terminado"), quien registra compras recibe la vista Facturas y su listado, siempre
  limitados a su tienda. Antes solo los administradores veían Facturas.
- **Archivo en el mismo paso:** el vínculo va en una transacción; el archivo se guarda enseguida
  con las reglas de siempre. Si el archivo falla (p. ej. Drive sin conectar), la factura queda
  registrada sin archivo en "Faltan subir" y se avisa: el vínculo no se pierde.
- **Proveedor:** las compras no guardan proveedor; el filtro de la bandeja es por fecha, tienda,
  cotización, producto o cliente. El proveedor es dato de la factura (filtro y búsqueda en Facturas).
- **Quitar compra:** la compra vuelve a "pendiente"; si la factura se queda sin compras y no tiene
  archivo, se elimina (misma regla que al anular).
- "Corregir compra" sigue igual (sacar la factura ahí la deja en "no lleva factura").

| 13-nov | grulla_be | `a0599b2` | "Ingresar al almacén": `GET /purchase-order/item/:itemId/warehouse-options` (si se ofrece, almacenes que el usuario opera con los de la tienda de la cotización primero, y el sugerido), la compra acepta `lot_code`/`expiry_date` para almacenes con lotes, RBAC 319, suite `purchase-warehouse-entry` (5) |
| 13-nov | grulla_fe | `bf13155` | Selector "Ingresar al almacén" en el formulario de compra (preseleccionado el predeterminado de la tienda si la tienda usa almacén; "No ingresar"; lote y vencimiento en almacenes con lotes), e2e `purchase-warehouse` |

**Selector "Ingresar al almacén" terminado** (pendiente del ítem 2). jest `purchase-warehouse-entry` (5),
`inventory`, `purchase-invoice-pending`, `expense-funding`, `flow-guards` y `rbac` en verde (61); e2e
`purchase-warehouse`, `purchase-invoices`, `inventory` y `flow-guards` en verde; `npm run build` en verde.
Reglas: solo se ofrece si la empresa tiene inventario y el producto maneja stock; un usuario de
tienda solo ve y usa los almacenes de su tienda (otro responde 404); un perecible en un almacén
que controla vencimientos exige la fecha (si falta, no queda ni la compra ni el ingreso). Quien
registra compras puede ingresar al almacén sin tener el módulo Inventario (como pide el plan §8.4).

## Ítem 1 — guía de remisión, MODO MANUAL (14-nov)

Una sesión automática nocturna (tarea programada) se probó unos minutos el 13-nov y el usuario la
detuvo: se borraron la tarea y la carpeta `automatico`. Lo que alcanzó a dejar (migración, seeder,
modelos y catálogos de vehículos/conductores) se revisó, se corrigió (la tienda no tiene columna
`name`: se usa `business_code`) y se completó en esta sesión.

| Fecha | Repo | Commit | Qué |
|---|---|---|---|
| 14-nov | grulla_be | `3896df9` | Ítem 1 backend: tablas `dispatch_guide*`, vehículos, conductores, `company_sunat_settings` (solo `emission_mode`), funcionalidad `dispatch_guide`, RBAC 320–341; borrador desde cotización Lista/Entregada, transferencia (04) o de cero, con precarga; control de lo despachado; registrar la guía emitida (todos los faltantes juntos, número T### único también con registros simultáneos, PDF en el mismo paso, salida de almacén D4, historial); anular devuelve la salida; `createSaleExit` y `cancelStockDocument` reutilizables; suite `dispatch-guide` |
| 14-nov | grulla_fe | `a7316b0` | Logística → Guías (lista, armar, registrar con PDF, detalle con visor, descartar, anular), Vehículos y Conductores; "Armar guía de remisión" en el detalle de la cotización; eventos en el historial; e2e `dispatch-guides` |
| 14-nov | grulla_be | `22acdeb` | Prueba de la guía desde una transferencia |
| 14-nov | grulla_fe | `fe2c5d1` | "Guía de remisión" en el detalle de una transferencia de almacén |

**Modo manual terminado.** jest `dispatch-guide` (11) en verde, más 60 de regresión (inventario,
compras al almacén, cotizaciones, reset, proveedores, RBAC, flow-guards); e2e `dispatch-guides`,
`inventory`, `navigation-smoke`, `quotation-share`, `purchase-invoices`, `purchase-warehouse` y
`flow-guards` en verde; `tsc` y `npm run build` en verde; migración y seeder de ida y vuelta.
Cubre del "terminado cuando" del plan §9: "el modo manual registra el número y el PDF" y "dos
emisiones simultáneas no duplican números". Lo demás (CDR, QR, rechazo de SUNAT) es de la emisión
directa.

Notas:
- `platform.spec` ("la vista de Empresas se ve bien") falla por datos: el aviso de la campana del
  cupo de correos (las pruebas mandan muchos correos de prueba en el día) tapa el encabezado en la
  captura. No es del ítem 1.
- Para el release: la migración `20261116100000` agrega la columna `stock_document.dispatch_guide_id`.

## Agregado al sprint (14-nov): productos no aceptados

Pedido del usuario: en una cotización a veces el cliente acepta unos productos y otros no. Cada
producto se marca "no aceptado" (o se reactiva) sin editar la cotización: el equipo lo sigue viendo
con su historial; el cliente no (PDF y enlace público) y no suma al total.

| Fecha | Repo | Commit | Qué |
|---|---|---|---|
| 14-nov | grulla_be | `8dfd865` | `quotation_item.is_excluded`, `PUT /quotation/item/:itemId/excluded`, total sin los no aceptados (también al editar), fuera del PDF/enlace público, de órdenes de compra, producción, guías, salida de almacén y Estadísticas; reglas (cotización abierta, uno aceptado mínimo, sin orden de compra ni guía, total ≥ cobrado); RBAC 342; suite `quotation-item-exclusion` (7) |
| 14-nov | grulla_fe | `fd58d4c` | Botón por producto con confirmación, sección "No aceptados por el cliente" con "Reactivar", fuera de producción y de órdenes de compra; el formulario de editar los marca y no los suma; e2e `quotation-item-exclusion` |
| 14-nov | grulla_fe | `08e65a1` | Recarga sola si la app quedó con el JS anterior tras un despliegue (`vite:preloadError`, máx. una vez por minuto) |

## Release 1.7.0 / 0.7.0 (14-nov) — listo para subir, sin SUNAT

Guía para subirlo: [RELEASE-SPRINT-2.md](RELEASE-SPRINT-2.md). La emisión directa a SUNAT no va (falta
el RUC y la facturación); la guía de remisión en modo manual va, apagada por empresa.

Validación:
- **jest completo:** 67/67 suites, 667 pruebas en verde (1 omitida a propósito).
- **e2e completo:** 126 en verde, 9 fallan y ninguna por el sprint:
  - por datos de la base de pruebas: "Ana Acme" fuera del selector de 100 usuarios
    (`employee-debts` ×2, `quotations`, `requested-changes`), "Acme Corp QA" fuera del de 100
    empresas (`roles`), y el aviso del cupo de correos tapa la captura del encabezado
    (`platform`, `roles`);
  - desactualizadas desde antes del sprint (fallan igual en `main`): la captura de Caja (de octubre,
    anterior a los botones de cierres/deudas/transferir) y `document-settings` (busca `#account-ref1`,
    que ya no existía en `main`).
- **Ensayo de la actualización de producción** (base temporal, ya borrada): copia de la base del
  sprint → vuelta atrás de los 10 seeders y las 10 migraciones del sprint (48 tablas, como producción)
  → `db:upgrade-production` lista 10 + 10 pendientes → el build de producción arrancó, respondió
  `/api/health` y aplicó solo las 10 migraciones y 10 seeders → columnas, índices, claves foráneas y
  permisos (250 recursos, 2113 asignaciones) idénticos a la base del sprint.
  Nota: la vuelta atrás de `20261114100000` falla si ya hay el mismo código de producto con dos
  proveedores (lo permite D6): para volver atrás en producción se restaura el respaldo.
- **`npm run release`:** ver la fila de abajo.
- Plantilla de variables de producción con `APP_PUBLIC_URL`, `EMAIL_*` y el cron cada 10 minutos.
- **Corrección antes de subir (14-nov, `8a5ad41`):** el menú de una empresa mostraba Inventario,
  Guías de remisión y Stock de proveedores aunque la funcionalidad estuviera apagada (los endpoints ya
  respondían 403). `/access/me` ya no trae esos módulos ni sus botones si la empresa no los tiene; el
  Super Administrador los sigue viendo. Suites de funcionalidades/acceso 49/49; e2e de esas pantallas
  33 en verde (2 de `platform`: la captura ya conocida y una intermitente que pasa al repetirla).
  Paquete rearmado (sigue siendo 1.7.0).

## Notificaciones al teléfono — 1.8.0 / 0.8.0 (14-nov, rama `feature/notificaciones-push`)

Pedido del usuario: con la app instalada en el teléfono, que llegue un aviso cuando entra un pedido
"Pendiente de cotizar" desde la web. Aprobó `web-push` 3.6.7 y eligió subir 1.7.0 primero y esto
después, en su propia rama.

| Fecha | Repo | Commit | Qué |
|---|---|---|---|
| 14-nov | grulla_be | `e2fa4a1` | Módulo `push_notification` (tabla `push_subscription`, `/push/status|subscribe|unsubscribe|test` de autoservicio), aviso tras el commit del pedido web a quien completa cotizaciones en esa tienda + admins de la empresa, claves VAPID (`npm run push:keys`, `npm run release` las genera); suite `push-notification` (6) |
| 14-nov | grulla_fe | `ecbd285` | Menú de perfil → "Notificaciones" (activar/desactivar/probar en este teléfono; iPhone sin instalar explica cómo), service worker muestra el aviso y lo abre al tocarlo, `/cotizaciones?abrir=<id>`, "Salir" apaga los avisos del teléfono; e2e `push-notifications` (3) |

- **Ubigeo por nombre (14-nov, a pedido del usuario):** en la guía de remisión y en el almacén el
  distrito se elige escribiendo su nombre (tabla oficial INEI 2025, 1 891 distritos, 24 KB comprimida
  y solo se baja al abrir esos formularios) y se rellena solo cuando la dirección lo trae. Ante la
  duda (nombre repetido) ofrece opciones y no rellena. El detalle de la guía muestra el distrito en
  palabras. Pruebas: `ubigeo` (19, lógica) y `dispatch-guides` (5). Va en 1.8.0, no en el paquete 1.7.0.

- **1.8.1 (17-nov, a pedido del usuario): imagen de anuncios hasta 3 MB** (antes 2 MB). Solo anuncios:
  fotos de producto, logo y QR siguen en 2 MB. El cargador de imágenes del servidor ahora recibe el tope
  (`createImageUploader`) y el aviso de "muy pesada" sale en español con el máximo real; en pantalla el
  validador y `ImageUploadField` aceptan un `maxSizeMb` opcional (por defecto 2). Pruebas: `advertisement`
  (anuncio 2.5 MB entra, 3.5 MB no; producto 2.5 MB sigue rechazado) y e2e `advertisement-image-size` (2).

- **1.8.2 (19-nov, a pedido del usuario): corregir pagos desde la cotización y "No aceptado" visible.**
  Origen: en la cotización #37 una devolución de proveedor (S/ 38) se registró como pago del cliente y el
  pago final se partió en otro pago + un ingreso manual en Caja (arreglado a mano en producción; respaldo
  en `cargas\arreglo-cotizacion-37-2026-11-19`). La pestaña Pagos de la cotización ahora corrige, anula /
  restaura y abre el historial de cada pago (mismos botones RBAC y reglas que `/pagos`, mes cerrado =
  ajuste) y muestra los anulados tachados con "Anulado" (antes parecían vigentes); el detalle trae
  `corrections_count` de cada pago. El aviso de sobre-pago sugiere corregir o anular el pago mal
  registrado. "Corregir compra" recuerda que una devolución del proveedor se refleja bajando el monto. El
  botón «No aceptado» de cada producto tiene texto (antes un ícono que nadie encontraba), los no aceptados
  se ven en rojo y "Editar cotización" avisa que no se quite el producto. Pruebas: jest
  `payment-correction`, `payment`, `quotation-item-exclusion`, `business-logic-guards`,
  `cash-movement-correction` (45/45); e2e `payments`, `quotation-item-exclusion` y nuevo
  `quotation-payments-tab` (8/8).

Validación:
- jest `push-notification` + `web-quote-request`: 12/12; type-check de los dos repos y build en verde.
- e2e `push-notifications`, `install-app`, `login`: 16/16.
- Build de producción con el service worker real (prueba temporal, no se subió): un aviso entregado
  al service worker se muestra como "Nuevo pedido para cotizar" con el enlace a la cotización; si el
  navegador rechaza la suscripción, el mensaje sale en español y el botón no se queda colgado.
- **No se pudo probar acá** la entrega real por Google/Apple: ningún navegador automatizado trae el
  servicio push. Se confirma en un teléfono después de subir, con "Enviar prueba".
- Al subir 1.8.0: el `.env` de producción necesita `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`
  (generarlas UNA vez y no cambiarlas). La migración `20261118100000` crea `push_subscription`.

## Pedidos del 21-nov — 1.9.0 / 0.9.0 (rama `feature/pedidos-21-nov`, sale de `main` 1.8.2)

Plan aprobado por el usuario (decisiones: descuento **por producto**, % o **precio unitario final**;
préstamos **simple + cobros + Caja**; cambiar a cualquier estado **solo admins y Super Admin**; Excel de
cotizaciones, Caja y pagos, facturas e IGV, inventario y compras; **sharp** para las fotos del PDF; mockups
**solo para el equipo**).

| Repo | Commit | Qué |
|---|---|---|
| grulla_be | `86ec6ff` | Precio vaciado al editar = sin precio (técnica valida "al menos uno" sobre el resultado) |
| grulla_be | `a9f266b` | Seeder: «No aceptado» para todo rol que edita cotizaciones |
| grulla_be | `cd9f760` | PDF público con las reglas de la vista (borrada / pendiente de cotizar = 404) |
| grulla_be | `71e421d` | `PUT /quotation/force-status/:id` (admins), reglas del dinero, stock, vigencia, evento `status_forced` |
| grulla_be | `4cc4f8a` | Descuento por producto (migración 20261121100000), PDF con P. lista / Desc. |
| grulla_be | `400c15a` | `GET /cash-movement/igv-breakdown` (totales = recuadro de Caja) |
| grulla_be | `59fce19` | Mockups privados (migración 20261121100100, tabla `quotation_mockup`) |
| grulla_be | `22f7f37` | Excel (`core/excel`, worker_thread, tope 20 000 filas) de 7 listados; filtros compartidos lista/Excel |
| grulla_be | `e2d2a56` | PDF de la orden de compra con foto (sharp 0.35.5), `core/pdf` compartido con la cotización |
| grulla_be | `08cb9c2` | Módulo `loan` (migración 20261121100200) + Caja (fuente `loan`) + Estadísticas (interés = ingreso) |
| grulla_fe | `40624ad` | Precios vaciados = null; un listener: la rueda/touchpad ya no cambia los inputs numéricos |
| grulla_fe | `d703e7c` | «No aceptado» deshabilitado con motivo; `/c/<código>` abre el PDF; WhatsApp "Enviar PDF y enlace"; selector "Cambiar estado" |
| grulla_fe | `accf94d` | Descuento por producto en el formulario y el detalle |
| grulla_fe | `6f41003` | Caja: "Ver cómo se calculó" el IGV (cuenta, barras y tablas) |
| grulla_fe | `9eef4a3` | Pestaña "Diseños" (subir, ver, descargar, quitar) |
| grulla_fe | `7028f84` | `ExportExcelButton` en 6 pantallas y en el diálogo del IGV |
| grulla_fe | `44d6d0e` | Botón PDF en Órdenes de compra; `PdfPreviewDialog` compartido |
| grulla_fe | `97f0c37` | Pantalla Préstamos (Finanzas) y la fuente "Préstamo" en Caja |
| grulla_fe | `95e9e89` | e2e `pedidos-21-nov` (empresa desechable, `--no-deps`) |

Migraciones nuevas: `20261121100000` (descuento), `20261121100100` (mockups), `20261121100200` (préstamos).
Seeders nuevos: `20261121100100` … `20261121100700` (RBAC; idempotentes, por código). Librería nueva:
**sharp 0.35.5** (anotada en CLAUDE.md, verificar `@img/sharp-linux-x64` en el ensayo del release).

Validación (21-nov, instancia aparte 4762/4262 sobre `grulla_s2_dev`, con un admin de reemplazo para no
cerrar la sesión de admin.qa):
- **jest completo:** 76/77 suites, 711 pruebas en verde (1 omitida a propósito). La única que falla,
  `receivables-advance-reminders`, ya fallaba antes de los cambios (el admin de reemplazo queda fuera del
  selector de 100 usuarios). Suites nuevas: product-price-clear, public-quotation-pdf, quotation-force-status,
  quotation-item-discount, igv-breakdown, quotation-mockups, excel-export, purchase-order-pdf, loan.
- **e2e nuevo `pedidos-21-nov`:** 5/5 (empresa desechable, `--no-deps`). Sin el arreglo, Chromium bajaba
  un input numérico con foco de 1000 a 995 con la rueda; con el arreglo queda en 1000.
- **PDF de la cotización:** mismo texto y mismos trazos (streams de dibujo comparados) antes y después de
  pasar fuentes/encabezado a `core/pdf`, en 3 cotizaciones reales.
- type-check de los dos repos y build de producción del frontend en verde.
- **e2e existentes de las pantallas tocadas** (17 archivos): 72/77 en verde. `quotation-item-exclusion` se
  actualizó (el último «No aceptado» ahora se ve deshabilitado con el motivo) y pasa. Las otras 4 ya fallaban
  antes: la captura de Caja (desactualizada), `employee-debts` ×2 y `quotations` ("Ana Acme" fuera del
  selector de 100 usuarios).

Notas para el usuario:
- «No aceptado» ya estaba (1.8.2): se ocultaba si la cotización tenía un solo producto, estaba cerrada o el
  rol no tenía el permiso. Ahora se ve deshabilitado con el motivo. Confirmar que producción tenga 1.8.2+.
- WhatsApp: `wa.me` no adjunta archivos. "Enviar PDF y enlace" usa el menú Compartir del equipo (Android,
  iPhone, Windows con WhatsApp de escritorio). Mandarlo sin intervención solo con la API de WhatsApp Business
  (de pago); no se propone ahora.
- IGV: el de ventas sale de lo COBRADO en cotizaciones con IGV (no de facturas emitidas, que no tienen
  monto). Una cotización hecha sin IGV y facturada con IGV no suma (lo encontró el análisis BEQ del 21-nov).
- El detalle del IGV está en Caja; en Cierres no (su alcance es de empresa y el de Caja es por tienda).

### Cuentas bancarias con CCI y la cuenta "Pruebas" de producción (21-nov)

- Cuenta de pago bancaria: número del banco (`ref1`) + **CCI** de 20 dígitos (`ref3`, migración
  `20261121100300`), los dos en la cotización (PDF). Una cuenta de pago ya no se puede crear sin empresa.
- Producción: se borró la cuenta id 32 "Pruebas" (Yape, sin empresa, les salía a todas). Respaldo y
  reversión en `cargas\borrar-cuenta-pruebas-2026-11-21\`.

### E2E del sistema completo (21-nov)

Pedido del usuario: una prueba Playwright de punta a punta sobre una base local propia.

- **Cómo se corre:** `npm run test:e2e:full` en grulla_fe. Playwright levanta su propio backend
  (`grulla_be/scripts/e2e-full-server.js`) y su propio Vite. Los puertos están en el bloque `E2E_*` del
  `.env` del backend: base `grulla_e2e_local`, backend 4770, frontend 4270. Nunca reutiliza un servidor
  ya levantado.
- **La base:** se crea si no existe, se migra y vuelve a fábrica en cada corrida (solo queda el Super Admin
  `admin@acme.test`). El lanzador se niega si el nombre no termina en `_local`/`_test`, si es la base de
  desarrollo (`PROY_BD`) o si `NODE_ENV=production`. `grulla_s2_dev` no se toca.
- **El recorrido** (`e2e/full/sistema-completo.spec.ts`, 22 pasos en orden, todo por la interfaz):
  1. **Super Admin:** empresa → tienda → admin y gestor con su invitación. Los dos activan su cuenta por el
     enlace, que sirve una sola vez.
  2. **Admin:**
     - cuenta bancaria con CCI;
     - saldo inicial de Caja;
     - cliente, producto con personalización y técnica;
     - cotización con 10 % de descuento (S/ 265.50);
     - PDF y enlace del cliente;
     - aceptada con adelanto por transferencia;
     - diseño;
     - estados;
     - orden de compra para el gestor.
  3. **Gestor:**
     - ve la cotización de su tienda;
     - registra la compra con factura pendiente;
     - no ve "Cambiar estado" ni entra a Estadísticas.
  4. **Admin:**
     - registra la factura de la compra;
     - genera el PDF de la orden;
     - cambia el estado a mano a "Lista para entregar";
     - entrega, cobra el saldo y finaliza.
  5. **Caja:**
     - registra un gasto;
     - el IGV del mes cuadra: 40.50 − 18.00 = 22.50;
     - descarga el Excel de Caja y el del IGV.
  6. **Cierre del recorrido:**
     - un préstamo con su cobro aparece en Caja;
     - Estadísticas muestra sus gráficas;
     - se descarga el Excel de cotizaciones;
     - 17 vistas del admin cargan sin errores de consola.
- **Resultado:** 5 corridas. Dieron 22/22 en verde la 2, la 4 y la 5, en ~3 min cada una. Las 2 últimas
  ya tenían el cambio de abajo.
  - En la 1 y la 3, la pestaña del admin quedó en blanco: en la 1 se congeló 19 min en el paso 11 y en la
    3 se quedó en `/pagos` en el paso 22.
  - Causa probable: poca memoria. Este equipo tiene 7.3 GB de RAM y 1.3 GB libres, y la prueba tenía 3
    pestañas abiertas además del backend y Vite. A mano la app nunca se congeló.
  - Cambio: la pestaña del Super Admin se cierra después del paso 4 y la del gestor después del 14.
  - La prueba ahora imprime si una pestaña se cae, si la app tira un error o si falla una petición. En las
    2 corridas finales no apareció ninguno.

## Para revisar con el usuario

- Motivos por caso (confirmar con el contador): la precarga usa 01 desde una cotización y 04 desde
  una transferencia; el resto se elige a mano (02, 07, 17...).
- Quién hace qué: operar guías (armar, registrar, PDF, descartar) = quien ve cotizaciones, Gestor
  incluido (en su tienda); vehículos, conductores y anular una guía registrada = administradores.
- El tipo de documento del destinatario se deduce del número (11 dígitos RUC, 8 DNI); si no, se
  elige en el formulario.
- La guía registrada se anula en el sistema, pero la baja en SUNAT se hace en SOL (se avisa).
- Envío de la guía por correo/WhatsApp y el PDF propio con QR quedan para la emisión directa: en
  modo manual el PDF lo da SUNAT.

## En curso

- Release 1.7.0 listo para subir ([RELEASE-SPRINT-2.md](RELEASE-SPRINT-2.md)) + un solo cron cada
  10 minutos a `/api/internal/jobs/tick`.
- Notificaciones al teléfono (1.8.0) terminadas en `feature/notificaciones-push`: se suben después de
  1.7.0; falta probar un aviso real en un teléfono.
- Más adelante, la emisión directa de la guía a SUNAT (necesita su RUC, credenciales y autorización).

## Pendiente del usuario

- Dominio para los correos y cuenta de Brevo (variables `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY`,
  `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `APP_PUBLIC_URL`).
- Excel de proveedores (antes del ítem 6).
- Credenciales SOL y CDT (antes de la GRE).

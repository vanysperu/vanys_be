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

## Sesión automática (desde el 13-nov-2026 de noche)

El usuario dejó a Claude trabajando solo mientras duerme: la tarea programada de Windows
"Claude Sprint 2 automatico" corre `C:\Extensiones\vn\automatico\correr-claude.ps1` cada 30 min
(retoma la misma sesión; si el límite está agotado, termina y reintenta en la siguiente). Reglas e
instrucciones: `automatico\prompt-inicio.md`. Registros: `automatico\logs\`. Para detenerla: crear
el archivo `automatico\DETENER` o deshabilitar la tarea.

## Para revisar con el usuario

- (vacío)

## En curso

- Ítem 1 (GRE), MODO MANUAL (plan §9, opción C). Nada se envía a SUNAT. Todavía no empezado:
  primer paso = diseño de tablas (migración `dispatch_guide*`, catálogos de vehículos y
  conductores, `company_sunat_settings` solo con `emission_mode`) y módulo backend.

## Pendiente del usuario

- Dominio para los correos y cuenta de Brevo (variables `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY`,
  `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `APP_PUBLIC_URL`).
- Excel de proveedores (antes del ítem 6).
- Credenciales SOL y CDT (antes de la GRE).

# Módulo: supplier_stock (Stock de proveedores)

Sprint 2, ítem 6. Pedido del usuario: las importadoras mandan un enlace a un
Excel con su stock (cada una con su formato y sus códigos); al elegir un
producto en una cotización se ve cuánto hay en cada Excel **por separado** y la
suma. Plan §7.

## Código de módulo (RBAC)
`supplier_stock` (id preferido 25). Seeder:
`20261114110200-seed-supplier-stock-module.js`. Además del rol, la empresa
tiene que tener la funcionalidad `supplier_stock` (módulo `company_feature`):
sin ella todo responde 403 `FEATURE_DISABLED`.

## Endpoints
| Método | Ruta | Acción | Recurso |
|--------|------|--------|---------|
| GET  | /supplier-stock/lookup?productIds=1,2 | stock de hasta 100 productos (una llamada) | `supplier_stock.lookup.endpoint` |
| GET  | /supplier-stock/search | pantalla de stock (paginado por código) | `supplier_stock.search.endpoint` |
| GET  | /supplier-stock/sources | fuentes (paginado) | `supplier_stock.sources.endpoint` |
| POST | /supplier-stock/sources | crear fuente (201) | `supplier_stock.sources.create.button` |
| PUT  | /supplier-stock/sources/:id | editar fuente | `supplier_stock.sources.update.button` |
| PUT  | /supplier-stock/sources/:id/disable | deshabilitar / habilitar | `supplier_stock.sources.disable.button` |
| GET  | /supplier-stock/sources/:id/imports | historial de lecturas | `supplier_stock.imports.endpoint` |
| POST | /supplier-stock/sources/:id/refresh | "Actualizar ahora" (enlace) o leer el archivo subido (multipart `file`) | `supplier_stock.sources.refresh.button` |
| POST | /supplier-stock/preview | "Probar fuente": enlace, fuente guardada o archivo; no guarda nada | `supplier_stock.preview.button` |

`companyId` (query) / `company_id` (body): solo el Super Administrador, que
elige la empresa (que también tiene que tener la funcionalidad).

## Vistas de frontend vinculadas
- `supplier_stock.view` → `/stock-proveedores` (menú Ventas).
- En Nueva cotización, debajo de cada producto (usa `lookup`).

## Botones/acciones vinculadas
`supplier_stock.sources.create.button`, `supplier_stock.sources.update.button`,
`supplier_stock.sources.disable.button`, `supplier_stock.sources.refresh.button`,
`supplier_stock.preview.button`.

## Quién recibe qué (seeder)
- Ver el stock (pantalla, búsqueda y consulta al cotizar): quien ve cotizaciones
  (`cotizacion.list` / `cotizacion.find.endpoint`), Gestor incluido.
- Fuentes: los roles con `producto.create.button` (Administrador).

## Tablas (migraciones 20261114110000 y 20261114110100)
- `supplier_stock_source`: proveedor, nombre, tipo (`url` | `upload`), enlace
  **cifrado** (`secretBox`; nunca sale en claro: la API devuelve `hasUrl` y el
  dominio), hoja, fila de encabezado, `column_map` (encabezado o letra de
  columna de código, stock, color, descripción y precio), cada cuántos minutos
  se actualiza, estado de la última lectura.
- `supplier_stock_import`: historial de cada lectura (quién la disparó, filas,
  hash del archivo, error).
- `supplier_stock_item`: filas de la última lectura buena (`code_norm`
  indexado).
- `product_code.code_norm` y `product.sku_norm`: columnas generadas por MySQL
  con el código normalizado, indexadas, para el cruce.

## Reglas de negocio
- **Normalización del código**: mayúsculas, sin espacios, guiones, puntos,
  guiones bajos ni barras (`E1000-02` = `e1000.02`). Misma regla en JS
  (`normalizeCode`) y en las columnas generadas.
- **Cruce**: los códigos de proveedor del producto **de ese mismo proveedor**
  (D6: el mismo código de otra importadora es otro producto), los códigos sin
  proveedor y el SKU.
- **Color** (D2): si el código está vinculado a un color, su stock va a ese
  color; si no, se usa la columna de color del Excel (si se mapeó).
- **Cantidades en texto** (`parseQuantity`): "1,200", "1.200", "+500", ">1000",
  "Más de 300", "150 UND" → número; "Agotado", "Sin stock", "-" → 0; lo que no
  entiende queda en `quantity_text` y se muestra tal cual ("Consultar"). En
  CSV los números no se interpretan antes (así "1.500" es 1500, no 1,5).
- **Reemplazo atómico**: las filas nuevas entran con su `import_id` y en la
  misma transacción la fuente pasa a apuntar a esa lectura y se borran las
  anteriores. Si una lectura falla, queda la última buena y la fuente guarda el
  error.
- **Dato viejo**: en la cotización se marca si la última lectura tiene más de
  24 horas.
- **Descarga segura (SSRF)**: solo `https`; se resuelve el DNS y se rechazan IP
  privadas, locales, de enlace local y reservadas (v4 y v6, también mapeadas);
  la conexión usa la IP ya validada; cada redirección (hasta 5) se valida; tope
  de 20 MB y 30 s. Enlaces de Google Drive/Sheets, Dropbox y OneDrive se pasan
  a descarga directa.
- **Lectura** con SheetJS CE 0.20.3 en un `worker_thread` (384 MB, 60 s, hasta
  60 000 filas): no traba el servidor.
- **Archivo subido**: `.xlsx`, `.xls` o `.csv`, hasta 20 MB, con su firma
  real verificada; se lee en memoria y se descarta.
- **Actualización automática**: `POST /internal/jobs/tick` (cron cada 10 min)
  actualiza hasta 3 fuentes con enlace cuya lectura venció; una fuente que
  viene fallando se reintenta cada hora como mínimo.

## Pendiente con los Excel reales
Las reglas propias de cada proveedor (ej. un código que trae el color pegado,
cantidades con otros textos) se agregan en `services/shared/stock_parsing.ts`
cuando el usuario mande sus archivos.

## Pruebas
`tests/supplier-stock-parsing.unit.test.ts` (lectura, SSRF, enlaces) y
`tests/supplier-stock.test.ts` (fuentes, lectura, cruce, búsqueda, error,
permisos).

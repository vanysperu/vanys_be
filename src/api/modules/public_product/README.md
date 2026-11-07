# Módulo: public_product (Productos por API key)

Pedido explícito del usuario: subir productos de forma masiva desde una
integración (sin sesión), con foto, colores, categoría/subcategoría, y poder
copiar el mismo producto a otras empresas en la misma llamada.

## Código de módulo (RBAC)
No aplica: lo usa una integración, no un usuario. Se protege con **API key**
(`X-Api-Key`, ver [`api_key/README.md`](../api_key/README.md)); la empresa
sale de la key, nunca del body ni del query.

## Endpoints
| Método | Ruta                          | Acción                                   | Protección |
|--------|-------------------------------|------------------------------------------|------------|
| POST   | /api/public/products/images   | subir una foto (multipart, campo `file`) | API key    |
| POST   | /api/public/products/bulk     | crear/actualizar productos por SKU       | API key    |
| GET    | /api/public/products          | catálogo activo (paginado + filtros)     | API key    |
| GET    | /api/public/product-categories | categorías de la empresa (paginado)     | API key    |

### 1. Subir la foto
`multipart/form-data` con el campo `file` (PNG, JPG o WEBP, máx. 2 MB; se
valida la firma real del archivo). Se guarda en la base (como los logos) en la
empresa de la key. Respuesta `201`:
```json
{ "image_path": "/uploads/company-assets/12/5f0c….png", "image_url": "https://…/uploads/company-assets/12/5f0c….png" }
```
`image_path` es lo que se manda luego en la subida masiva. Si no se usa en
24 h, la limpieza de imágenes la borra.

### 2. Subida masiva
```json
{
  "replicate": true,
  "company_ids": [2, 3],
  "products": [
    {
      "sku": "TAZA-01",
      "name": "Taza mágica 11 oz",
      "description": "Cambia de color con el calor",
      "price_unit": 18, "price_hundred": 14.5, "price_half_thousand": null, "price_thousand": null,
      "category_id": 120,
      "subcategory_id": 121,
      "colors": [{ "name": "Negro", "hex": "#111111" }, { "name": "Azul" }],
      "codes": [{ "code": "ZX-4410", "supplier": "Distribuidora Andina", "color": "Negro" }, { "code": "9981" }],
      "image_path": "/uploads/company-assets/12/5f0c….png"
    }
  ]
}
```
- `products`: 1 a 200 por pedido. `sku` obligatorio (letras, números, `-`, `_`).
- **Upsert por SKU** (decisión del usuario): si en la empresa ya existe un
  producto con ese SKU, se **actualiza** con lo que llegó (lo que no llega se
  conserva; `null` limpia). Si no existe, se **crea** (exige `name` y al menos
  un precio). Un producto deshabilitado se actualiza pero sigue deshabilitado.
- `colors` reemplaza la lista completa (hasta 30, sin repetidos; `hex`
  opcional `#RRGGBB`). Sin `colors`, se conservan los actuales.
- `codes`: códigos de proveedores (un producto tiene **un solo SKU** pero puede
  tener varios códigos). Hasta 50; `supplier` opcional. Reemplaza la lista
  completa; sin `codes`, se conservan los actuales. **No se repiten** en la
  empresa: ni en el mismo producto, ni en otro producto, ni como SKU de otro
  (ver `product/README.md`).
- `codes[].color` (opcional): vincula el código con uno de los `colors` del
  producto, por nombre y sin distinguir mayúsculas. Un color que el producto no
  tiene da `CODE_COLOR_NOT_FOUND`. Si se quita un color, los códigos que lo
  usaban siguen, sin color.
- `category_id` / `subcategory_id`: ids de **Variables Generales**
  (`product_category` / `product_subcategory`). Solo la subcategoría alcanza:
  se toma su categoría. Tienen que estar activas y ser **globales o de la
  empresa destino**.
- `min_order_quantity` (opcional): pedido mínimo, entero de 1 a 1 000 000.
  Sin el campo se conserva el actual (un producto nuevo queda sin mínimo);
  `null` lo quita. Un valor inválido → 400 `VALIDATION_ERROR` para todo el
  envío. Es informativo (ver `product/README.md`).
- `requires_customization` **se ignora** (pedido explícito del usuario): si
  llega, no da error, pero un producto nuevo siempre se crea con "Requiere
  personalización" apagado y uno existente conserva lo que tenga. Se enciende
  solo desde el sistema (editar producto).
- **Réplica** (`replicate: true` + `company_ids`): el producto también se crea
  o actualiza en esas empresas, pero **solo si el Super Administrador se las
  habilitó a esa key** (Configuración → API keys → "Puede replicar productos
  a"). Una empresa no permitida → `403 REPLICATE_NOT_ALLOWED` y no se toca nada.
  Cada empresa recibe **su propia copia** de la foto.
- **Categoría en la réplica** (decisión del usuario): en la empresa de la key
  la categoría tiene que ser válida (si no, el producto da error y no se guarda
  en ninguna). En una empresa de réplica, si la categoría o subcategoría no
  existe ahí (no es global ni de esa empresa), el producto **se guarda igual sin
  ella**: uno nuevo queda sin categoría y uno existente conserva la que tenía.
  Se avisa con `category_skipped: true` en `results[].companies[]` y un aviso por
  empresa en `warnings`. Con categorías **globales** se conserva en todas.
- **Transacción por producto**: un producto queda guardado en todas las
  empresas destino o en ninguna. Un producto con error no frena a los demás.

Respuesta `200`:
```json
{
  "summary": { "received": 1, "created": 3, "updated": 0, "failed": 0 },
  "results": [
    { "sku": "TAZA-01", "status": "ok", "companies": [
      { "company_id": 12, "product_id": 501, "action": "created" },
      { "company_id": 2, "product_id": 502, "action": "created" } ] }
  ],
  "warnings": ["Las fotos se guardaron, pero no se muestran en las empresas 2 porque no tienen habilitadas las fotos de productos."]
}
```
`created`/`updated` cuentan empresas (un producto replicado a 3 empresas
suma 3). Errores por producto: `{ "status": "error", "error": "…", "code": "…" }`
con `code` `INVALID_CATEGORY`, `INVALID_SUBCATEGORY`, `PRICE_REQUIRED`,
`NAME_REQUIRED`, `INVALID_IMAGE_PATH`, `DUPLICATE_SKU`, `DUPLICATE_PRODUCT_CODE`,
`CODE_COLOR_NOT_FOUND`,
`PRODUCT_CODE_TAKEN` o `INTERNAL_ERROR`.

### Categorías de la empresa (con cantidades)
`GET /api/public/product-categories?page=1&limit=100&include_global=true&search=termo`
- Por defecto, solo las categorías **de la empresa de la key** (pedido explícito
  del usuario: "solo las de la empresa y no globales"), activas, ordenadas por
  nombre. Con `include_global=true` agrega también las globales (marcadas con
  `is_global: true`), nunca las de otra empresa. Cada una trae sus `subcategories` activas de la empresa (anidadas,
  sin paginar). Paginado por categoría (`limit` máx. 100).
- **Cantidades** (pedido de la web, para el menú): cada categoría trae
  `product_count` = sus productos activos. `search` es la **búsqueda de
  productos** (el mismo `search` de `GET /products`, con las mismas reglas) y
  cambia solo las cantidades: las categorías se listan igual, con 0 si no tienen
  resultados (decisión de la web). Antes `search` filtraba las categorías por su
  nombre; la web lo aprobó porque nadie lo usaba (la subida masiva no llama a
  este endpoint).
- `summary` cubre TODA la búsqueda, no solo la página: `total` = productos
  activos que cumplen `search` (igual al `meta.total` de `GET /products` con el
  mismo `search`) y `without_category` = los que no tienen categoría vigente.
  Con `include_global=true`, `total = Σ product_count + without_category`. Sin
  `include_global`, los productos de categorías globales cuentan en `total` pero
  en ninguna fila de la lista.
- Una **categoría deshabilitada** no se lista y sus productos cuentan como sin
  categoría (decisión de la web).
- Una sola consulta agrupada para las cantidades (`services/list_categories.service.ts`).

Respuesta (`data` del esqueleto estándar):
```json
{
  "data": [
    { "id": 120, "name": "Bebidas", "code": "BEB", "is_global": false, "product_count": 2,
      "subcategories": [{ "id": 121, "name": "Termos", "code": "TER" }] },
    { "id": 130, "name": "Tecnología", "code": "TEC", "is_global": true, "product_count": 0, "subcategories": [] }
  ],
  "meta": { "page": 1, "limit": 100, "total": 2, "totalPages": 1 },
  "summary": { "total": 2, "without_category": 0 }
}
```
`meta.total` cuenta categorías; `summary.total`, productos.

### 3. Catálogo
`GET /api/public/products?page=1&limit=20&search=taza&sku=&skus=&code=&category_id=&without_category=&subcategory_id=&color=azul&orderBy=name&orderDir=asc`
- Solo productos **activos** de la empresa de la key: un producto deshabilitado
  nunca sale (pedido explícito del usuario), ni buscándolo por SKU, código o
  `skus`. Es una condición fija (`is_deleted = false`); ningún parámetro (ej.
  `status`) la cambia. `limit` máx. 100.
- `search`: buscador flexible (`core/utils/searchTerms.ts`, pedido explícito del
  usuario). Cada palabra tiene que aparecer, en cualquier orden, en alguno de
  estos campos (cada palabra puede estar en uno distinto):
  - nombre, SKU, código de proveedor, color, nombre de la categoría y de la
    subcategoría (vigentes): **contienen** la palabra, así se encuentra mientras
    se escribe ("ter" → Termo; "LAP-MT", "J1000" → SKU y códigos con guion);
  - descripción: **inicio de palabra** (decisión de la web), con cualquier signo
    como separador: "26cm" encuentra "10*26CM", pero "500ml" no encuentra
    "1500ML" ni "ter" encuentra "material". Va con `REGEXP` (LIKE no distingue
    inicios de palabra); como REGEXP no ignora acentos, cada vocal, la n y la c
    aceptan sus variantes (`services/shared/catalog_scope.ts`).
  Entiende plurales ("gorras" → Gorra, "lapices" → Lápiz), ignora mayúsculas,
  acentos y palabras vacías ("de", "para"...) y en colores acepta el otro género
  ("gorras negras" → color Negro). Lee hasta 6 palabras. No corrige errores de
  tipeo. La pantalla de Productos y la cotización usan el mismo buscador, pero
  **sin** categoría, subcategoría ni descripción (la ampliación es solo de la web).
- `sku` y `code` buscan solo en ese campo, y `color` solo en los colores: contienen
  el texto, literal.
- `skus=SKU1,SKU2`: varios productos por SKU (carrito, fichas por enlace, fotos de
  merchandising de la web). Coincidencia **exacta** sin distinguir mayúsculas; se
  ignoran espacios, vacíos y repetidos. Hasta 100 SKU distintos (más → 400
  `VALIDATION_ERROR`). Los que no existen o están deshabilitados no se devuelven.
  Sigue paginado: para muchos SKU, `limit=100`. `skus=,,` (lista sin SKU) no
  devuelve nada.
- `category_id`: categorías de la empresa **o globales**. Una categoría
  deshabilitada no devuelve nada (para la web, sus productos no tienen categoría).
- `without_category=true`: productos sin categoría o con una categoría
  deshabilitada. Junto con `category_id` → 400 `VALIDATION_ERROR`.
- `orderBy` (siempre con desempate por `id`, así la paginación no repite ni salta
  productos aunque se hayan creado en la misma tanda):
  - `name`, `sku`, `price_unit` o `created_at` (por defecto), en `orderDir`;
  - `price_hundred`: los sin precio (`null` o 0) **siempre al final**, en `asc`
    y en `desc`. Índice `idx_product_company_price_hundred`;
  - `category`: por nombre de la categoría vigente en `orderDir` (las categorías
    no tienen un campo de orden); dentro de cada una por SKU ascendente; los sin
    categoría al final.
- Respuesta `{ data, meta: { page, limit, total, totalPages } }`; cada producto
  trae `category`, `subcategory`, `colors`, `codes` e `image_url` (URL absoluta, o
  `null` si no tiene foto o la empresa no tiene habilitadas las fotos). No trae
  datos internos (empresa, auditoría, estado). Trae también `min_order_quantity`
  (pedido mínimo, `null` = sin mínimo). `category` es `null` si la
  categoría está deshabilitada (así la tarjeta y el menú coinciden), y sin
  categoría vigente `subcategory` también es `null`.
- Las reglas del catálogo (empresa, solo activos, categoría vigente, búsqueda
  ampliada, orden) están en `services/shared/catalog_scope.ts`, compartidas con
  las cantidades por categoría para que siempre cuadren.

## Reglas de negocio
- **Fotos por empresa**: el Super Administrador las habilita en Empresas
  (`company.product_images_enabled`). Deshabilitadas: no se muestran ni en el
  sistema ni en este catálogo; la subida masiva igual guarda la foto (sin
  pérdida de datos) y avisa en `warnings`.
- Lo que crea la integración queda a nombre de quien emitió la key.
- Las fotos de productos cuentan como "en uso" para la limpieza de imágenes
  (ver `uploads/README.md`).

## Vistas / botones vinculados
Ninguno propio (la gestión de keys y empresas extra está en API keys).

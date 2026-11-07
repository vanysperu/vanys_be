# Módulo: product (Productos)

## Código de módulo (RBAC)
`producto` (módulo 6, "Productos"). Comparte módulo con las técnicas
de personalización ([`customization_technique`](../customization_technique/README.md)).

## Endpoints
| Método | Ruta                  | Acción           | Requiere módulo |
|--------|-----------------------|------------------|-----------------|
| GET    | /product/list         | list (pag)       | producto        |
| POST   | /product/create       | create           | producto        |
| PUT    | /product/update/:id   | update           | producto        |
| PUT    | /product/disable/:id  | disable (toggle) | producto        |
| POST   | /product/image        | subir foto       | producto (`producto.image.upload.button`) |

Filtros de `list`: `searchTerm`, `name`, `sku`, `status` (`active`/`inactive`,
CSV), `dateFrom`/`dateTo` (fecha de creación, hora de Lima), `code`, `categoryId`,
`subcategoryId`, `color` (el nombre del color contiene el texto). Cada fila trae
`category`, `subcategory` (`{id, name}`), `colors` (`[{name, hex}]`), `codes`
(`[{code, supplier}]`) e
`images_enabled` (la empresa del producto muestra fotos) y `company_name`. Solo el
Super Administrador ve la columna Empresa y filtra por empresa (`companyId`, que
el backend ignora para los demás usuarios). Para integraciones
ver [`public_product`](../public_product/README.md) (subida masiva por API key).

## Vistas de frontend vinculadas
- producto.list (`/productos`, pestaña "Productos" de la pantalla "Productos")

## Botones/acciones vinculadas
- producto.create.button
- producto.update.button
- producto.disable.button
- producto.image.upload.button

## Reglas de negocio propias del módulo
- Hasta 4 precios por unidad según el volumen (unidad, ciento, medio millar,
  millar); se exige al menos uno.
- **"Requiere personalización"** (`requires_customization`, pedido explícito
  del usuario: "muchos productos no requieren personalizado"). Apagado por
  defecto; la migración `20261107110000` lo apagó en todos los productos (se
  habían subido encendidos) y la carga masiva de la web no lo toca:
  - Apagado → el producto se cotiza **sin técnica**: no hay selector de
    técnica en la cotización, el precio es solo el del producto y el PDF no
    muestra la columna "Técnica" si ningún item lleva una.
  - Encendido → la técnica es obligatoria en la cotización y su precio se suma
    al del producto en la misma escala.
  - El backend lo valida al cotizar: exige técnica solo cuando el producto la
    requiere y rechaza una técnica en un producto que no la usa.
  - Productos nuevos: **apagado** por defecto. Los que existían antes de la
    migración `20261021100000` quedaron encendidos (hasta entonces toda
    cotización exigía técnica).
- `create` usa una lista blanca explícita de campos (el body no puede fijar
  `id`, `is_deleted` ni auditoría); `company_id` debe ser el de la sesión.
- Un SKU vacío (`""`) se guarda como `null` (sin SKU).
- Un producto deshabilitado no se puede usar en cotizaciones nuevas.
- **Categoría y subcategoría** (pedido explícito del usuario): filas de
  Variables Generales (`product_category` / `product_subcategory`, la
  subcategoría guarda en `ref1` el id de su categoría). Tienen que estar activas
  y ser globales o de la empresa del producto; la subcategoría, de la categoría
  elegida (`services/shared/catalog.ts`). Cambiar la categoría sin mandar
  subcategoría la limpia.
- **Un solo SKU, varios códigos** (tabla `product_code`, pedido explícito del
  usuario): cada proveedor puede identificar el producto con su propio código.
  Cada código lleva el nombre del proveedor opcional (texto libre: no hay
  entidad de proveedores). Hasta 50; guardar reemplaza la lista completa. El
  SKU sigue siendo uno solo y es la llave de la subida masiva. La búsqueda
  general (`searchTerm`, ver `product_search.ts`) encuentra por nombre, SKU, **código** o color, con plurales y varias palabras; el filtro
  `code` busca solo en los códigos.
- **Código por color** (`product_code.color`, opcional): un código puede
  vincularse con uno de los colores del producto (ej. E1000-02 = Negro). Va en
  el código porque un color puede tener varios códigos, uno por proveedor. Se
  guarda el nombre del color; uno que el producto no tiene →
  `400 CODE_COLOR_NOT_FOUND`. Si cambian los colores y no llega la lista de
  códigos, los que apuntaban a un color quitado quedan sin color.
- **Los códigos no se repiten** (pedido explícito del usuario), dentro de la
  empresa y sin distinguir mayúsculas:
  - ni dentro del mismo producto, aunque cambie el proveedor
    (`400 DUPLICATE_PRODUCT_CODE`);
  - ni en otro producto, ni como SKU de otro producto; y un SKU no puede ser el
    código de otro producto (`409 PRODUCT_CODE_TAKEN`, el mensaje dice cuál).
  - La base lo garantiza con el índice único `(company_id, code)` (migración
    `20261104120000`). Entre empresas distintas sí puede repetirse: la réplica
    de la subida masiva copia los códigos a cada empresa.
- **Colores** (tabla `product_color`): nombre + hex opcional, en orden, hasta
  30 y sin repetidos. Guardar los colores reemplaza la lista completa.
- **Foto** (`image_path`, imagen de `company_asset` de la MISMA empresa): solo si
  la empresa tiene `product_images_enabled` (la habilita el Super
  Administrador en Empresas; si no, `403 PRODUCT_IMAGES_DISABLED`). Quitarla
  siempre se puede. Al reemplazarla o quitarla, la anterior se borra en la
  misma transacción. En la pantalla, un producto con foto muestra una miniatura.
- **Ficha del producto:** el clic en el nombre de cualquier producto, tenga foto
  o no, abre su ficha con foto, SKU, estado, categoría, descripción, precios,
  colores y códigos con su color y proveedor (`ProductDetailDialog`).
- Crear/editar (con colores) va en **una transacción**; la lógica es la misma
  que usa la subida masiva (`services/shared/save_product.ts`).
- `orderBy` del listado acepta `created_at`, `name`, `sku`, `price_unit`,
  `updated_at`; cualquier otro valor ordena por fecha de creación.

## Campos especiales
- Precios `DECIMAL(10,2)` opcionales; `requires_customization` BOOLEAN
  (default `false`).

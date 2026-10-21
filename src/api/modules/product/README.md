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

Filtros de `list`: `searchTerm`, `name`, `sku`, `status` (`active`/`inactive`,
CSV), `dateFrom`/`dateTo` (fecha de creación, hora de Lima).

## Vistas de frontend vinculadas
- producto.list (`/productos`, pestaña "Productos" de la pantalla "Productos")

## Botones/acciones vinculadas
- producto.create.button
- producto.update.button
- producto.disable.button

## Reglas de negocio propias del módulo
- Hasta 4 precios por unidad según el volumen (unidad, ciento, medio millar,
  millar); se exige al menos uno.
- **"Requiere personalización"** (`requires_customization`, pedido explícito
  del usuario: "muchos productos no requieren personalizado"):
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

## Campos especiales
- Precios `DECIMAL(10,2)` opcionales; `requires_customization` BOOLEAN
  (default `false`).

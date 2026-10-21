# Módulo: customization_technique (Técnicas de personalización)

## Código de módulo (RBAC)
`producto` (módulo 6, "Lista de precios") — las técnicas comparten módulo
con los productos; sus vistas/botones cuelgan de la vista
`producto.technique.list`.

## Endpoints
| Método | Ruta                                  | Acción     | Requiere módulo |
|--------|---------------------------------------|------------|-----------------|
| GET    | /customization-technique/list         | list (pag) | producto        |
| POST   | /customization-technique/create       | create     | producto        |
| PUT    | /customization-technique/update/:id   | update     | producto        |
| PUT    | /customization-technique/disable/:id  | disable (toggle) | producto  |

Filtros de `list`: `name`, `status` (`active`/`inactive`, CSV), `dateFrom`/
`dateTo` (fecha de creación, `YYYY-MM-DD` en hora de Lima).

## Vistas de frontend vinculadas
- producto.technique.list (`/productos/tecnicas`, pestaña de "Lista de precios")

## Botones/acciones vinculadas
- producto.technique.create.button
- producto.technique.update.button
- producto.technique.disable.button

## Reglas de negocio propias del módulo
- **Se cotiza igual que un producto** (pedido explícito del usuario): la
  técnica tiene los mismos 4 precios por volumen (`price_unit`,
  `price_hundred`, `price_half_thousand`, `price_thousand`) y el precio de
  un item de cotización es
  `(precio del producto en esa escala + precio de la técnica en esa escala) × cantidad`.
  Ej.: jabón ciento S/ 0.90 + serigrafía ciento S/ 0.95, 10 unidades →
  (0.90 + 0.95) × 10 = S/ 18.50.
- Solo se usa en productos que **requieren personalización** (ver
  [`product`](../product/README.md)); un producto sin personalización se
  cotiza sin técnica.
- Si la técnica no tiene cargado el precio de la escala elegida, la
  cotización se rechaza con un mensaje claro (nunca se asume 0).
- En modo `custom` de la cotización, el precio de la técnica es el que se
  escriba para ese item (`custom_technique_price`) o, si se deja vacío, su
  `price_unit`.
- Al crear se exige al menos uno de los 4 precios.
- Ya no existe el costo "porcentual"/"fijo" (`extra_type`/`extra_value`):
  se eliminó en la migración
  `20261018100000-remove-percentage-from-technique.js`.
- `create` usa una lista blanca explícita de campos: `company_id` sale de
  la sesión (nunca del body), igual que el resto de catálogos.
- Una técnica deshabilitada no se puede usar en una cotización nueva; las
  cotizaciones viejas que la referencian se siguen viendo completas.

## Campos especiales
- Los 4 precios son `DECIMAL(10,2)` opcionales.

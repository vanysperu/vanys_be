# Módulo: advertisement (Anuncios de la web)

Pedido explícito del usuario: gestionar las imágenes publicitarias que se
muestran en la web de la empresa. Se sube una foto, se elige su **zona** (el
lugar de la web donde sale) y su orden, se apaga/prende, y se elimina. La web
las pide con su **API key**, zona por zona.

## Código de módulo (RBAC)
`advertisement` (seeder `20261106110100-seed-advertisement-module.js`). Se
otorga a los roles que ya pueden crear productos (`producto.create.button`);
el Gestor no lo recibe (CLAUDE.md 11.1: no gestiona configuración). El Super
Administrador lo tiene implícito.

## Endpoints (panel, con sesión)
| Método | Ruta                            | Acción                              | Recurso RBAC                    |
|--------|---------------------------------|-------------------------------------|---------------------------------|
| GET    | /api/advertisement/list         | list (pag) por zona/estado/título   | advertisement.list.endpoint     |
| POST   | /api/advertisement/image        | subir la imagen (multipart `file`)  | advertisement.image.button      |
| POST   | /api/advertisement/create       | create                              | advertisement.create.button     |
| PUT    | /api/advertisement/update/:id   | update (zona, título, enlace, imagen, posición) | advertisement.update.button |
| PUT    | /api/advertisement/position/:id | mover dentro de su zona             | advertisement.position.button   |
| PUT    | /api/advertisement/disable/:id  | apagar/prender (`{ is_active }`)    | advertisement.disable.button    |
| DELETE | /api/advertisement/delete/:id   | eliminar DEFINITIVO                 | advertisement.delete.button     |

## Endpoint público (web, con API key)
`GET /api/public/advertisements?zone=inicio&page=1&limit=20` con la cabecera
`X-Api-Key` (misma key de la web, ver `api_key/README.md`).
- `zone`: **código** de la zona (sin distinguir mayúsculas). También sirve
  `zone_id` (id de la zona). Sin zona: todos, agrupados por zona (los sin zona
  al final).
- Solo anuncios **prendidos** de la empresa de la key, en su orden. Nunca los
  apagados ni los de una zona deshabilitada (deshabilitar la zona la apaga
  entera en la web). `limit` máx. 100.
- Respuesta `{ data: [{ id, title, link_url, image_url, zone: { id, code, name } | null, position }], meta }`.
  `image_url` es absoluta; `link_url` es a dónde lleva el clic (o `null`).

## Zonas (lugares de la web)
Pedido explícito del usuario: "podemos tener varios lugares de publicidad". Las
zonas son filas de **Variables Generales** con categoría `advertisement_zone`
(como las categorías de producto): `prefix_id` ("Código") es lo que manda la web
y `name` lo que se ve en el panel. Pueden ser globales (las crea el Super
Administrador) o de la empresa. El panel de Anuncios también las crea
("Nueva zona"), por el mismo endpoint de Variables Generales.
- El código **no se repite** entre las zonas activas que ve una empresa (las
  suyas y las globales): `409 DUPLICATE_ADVERTISEMENT_ZONE`.
- Un anuncio solo usa una zona activa, global o de su empresa:
  `400 INVALID_ADVERTISEMENT_ZONE`. La zona es opcional.
- Si la zona se borra de Variables Generales, sus anuncios quedan sin zona.

## Vistas de frontend vinculadas
- `advertisement.list` → `/anuncios` (grupo Ventas del menú).

## Botones/acciones vinculadas
- `advertisement.create.button`, `advertisement.image.button`
- `advertisement.update.button`, `advertisement.position.button`
- `advertisement.disable.button`, `advertisement.delete.button`

## Reglas de negocio propias del módulo
- **Eliminar es FÍSICO** (excepción explícita a la regla de soft-delete de
  CLAUDE.md, pedido del usuario: "el eliminado es total, no conservamos
  ninguna foto que se elimine"). En una transacción se borra la fila, su
  imagen (`company_asset`, si nada más la usa) y se cierra el hueco del orden.
  Para dejar de mostrar un anuncio sin perderlo, se **apaga** (`is_active`).
- **Orden por zona**: cada zona de cada empresa tiene su orden 1..N sin huecos
  (los sin zona, el suyo). Crear lo deja al final; mover corre a los demás;
  pasarlo a otra zona lo deja al final de la nueva. Crear, mover y eliminar
  bloquean la fila de la empresa para no chocar entre sí.
- **Imagen**: siempre subida al sistema por su empresa (PNG, JPG o WEBP, máx.
  2 MB), nunca un enlace externo (`400 INVALID_IMAGE_PATH`). Cambiarla borra la
  anterior. La limpieza de imágenes cuenta las de anuncios como "en uso"
  (también las de los apagados).
- `link_url`: opcional, solo `http://` o `https://` (la web lo pone en un href).
- Multiempresa: la empresa sale de la sesión. Un anuncio de otra empresa
  responde 404; solo el Super Administrador elige empresa (y ve la columna).

## Campos especiales
- `advertisement.zone_id` → `general_variable.id` (ON DELETE SET NULL).
- `position`: orden dentro de (empresa, zona); `zone_total` en la respuesta del
  panel = cuántos hay en esa zona (para no ofrecer "bajar" al último).
- Fechas `created_at`/`updated_at` salen como `{ date, time }` (hora de Lima).

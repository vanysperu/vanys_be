# Módulo: role (Roles)

## Código de módulo (RBAC)
`roles_access` — **exclusivo del Super Administrador** (ver
`src/core/rbac/systemOnlyModules.ts`). La misma pantalla "Roles y accesos"
agrupa también `roles_resources` (accesos por rol) y el catálogo `module` /
`resource`.

## Endpoints
| Método | Ruta               | Acción              | Requiere módulo / guard                        |
|--------|--------------------|---------------------|------------------------------------------------|
| GET    | /role/list         | list (pag)          | users (`users.roleOptions.endpoint`)           |
| POST   | /role/create       | create              | roles_access + `requireSystemRole`             |
| PUT    | /role/update/:id   | update              | roles_access + `requireSystemRole`             |
| PUT    | /role/disable/:id  | disable (toggle)    | roles_access + `requireSystemRole`             |

`GET /role/list` vive en el módulo **users**: el formulario de Usuarios lo
necesita para el selector de rol y para el filtro de la tabla. Un usuario de
empresa solo recibe los roles de SU empresa + las plantillas (nunca un rol
`is_system`); el Super Administrador ve todos.

## Vistas de frontend vinculadas
- roles_access.list (`/seguridad/roles-accesos`)

## Botones/acciones vinculadas
- roles_access.role.create.button
- roles_access.role.update.button
- roles_access.role.disable.button
- roles_access.assign.button

## Reglas de negocio propias del módulo
- Solo el Super Administrador crea, edita y deshabilita roles (pedido
  explícito del usuario). Lo exclusivo nunca llega al menú de un usuario de
  empresa ni se le puede otorgar a un rol de empresa.
- Al crear un rol, el Super Administrador elige la empresa dueña
  (`company_id`, validada: debe existir y estar activa). Sin empresa, el rol
  queda como **plantilla** compartida por todas las empresas.
- Los roles `is_system` (Super Administrador) no se editan ni se
  deshabilitan desde la pantalla.
- Todo rol nuevo recibe "Inicio" y "Recordatorios" (navegación básica).

## Campos especiales
- `company_name` (solo lectura, en `GET /role/list`): nombre de la empresa
  dueña; `null` para plantillas y roles de plataforma.

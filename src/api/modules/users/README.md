# Módulo: users (Usuarios)

## Código de módulo (RBAC)
`users`

## Endpoints
| Método | Ruta                    | Acción                  | Requiere módulo |
|--------|-------------------------|-------------------------|-----------------|
| GET    | /user/list              | list (pag)              | users           |
| GET    | /user/find/:id          | detail                  | users           |
| GET    | /user/user-account      | cuenta propia           | users           |
| POST   | /user/create            | create                  | users           |
| PUT    | /user/update/:id        | update                  | users           |
| PUT    | /user/disable/:id       | disable (toggle)        | users           |
| PUT    | /user/batch/disable     | disable masivo          | users           |
| PATCH  | /user/change/password   | cambiar contraseña      | users           |
| POST   | /user/:id/password-link | reenviar invitación o enlace de restablecer | users (`users.passwordLink.button`) |
| GET    | /role/list              | roles para el selector  | users (`users.roleOptions.endpoint`) |

`GET /role/list` es del módulo `role`, pero su permiso vive acá: el
formulario de Usuarios lo necesita para el selector de rol, y la pantalla de
Roles y accesos es exclusiva del Super Administrador.

## Vistas de frontend vinculadas
- users.list

## Botones/acciones vinculadas
- users.create.button
- users.update.button
- users.disable.button
- users.batchDisable.button
- users.passwordLink.button

## Reglas de negocio propias del módulo
- **Email único.**
- Todo usuario por debajo de Super Administrador necesita empresa. Quién la
  elige depende del caller: un `is_system` elige la empresa (obligatoria) y
  la tienda es opcional; un Administrador de empresa nunca elige empresa
  (siempre la suya, forzada) y la tienda es obligatoria.
- **El rol que se asigna se valida siempre** (`assertRoleIsAssignable`,
  `services/shared/assignable_role.service.ts`):
  - Nadie puede asignar un rol `is_system` salvo un caller que ya lo sea.
  - Un rol con `company_id = NULL` y `is_system = false` es una plantilla
    compartida (Administrador/Especialista/Gestor) y la puede usar cualquier
    empresa.
  - Un rol con `company_id` seteado solo lo asigna alguien de esa empresa, y
    solo a un usuario de esa misma empresa.
  - El rol debe existir y estar activo.

  Esto cierra una **escalada de privilegios real**: `company_id` y
  `business_unit_id` se forzaban correctamente, pero `roleIds` pasaba crudo
  desde el body. Como el rol id 1 ("Super Administrador") es `is_system` y
  un rol `is_system` recibe todas las rutas sin pasar por `roles_resources`,
  un Administrador de empresa podía hacer
  `PUT /user/update/<su id> { roleIds: 1 }` y quedarse con acceso a todas
  las empresas del sistema.
- **No se puede deshabilitar al único Administrador activo de una empresa**
  (`assertNotLastCompanyAdmin`) — dejaría a esa empresa sin nadie capaz de
  gestionar usuarios/roles, recuperable solo desde plataforma. El guard
  también contempla el batch: deshabilitar a los dos únicos admins en una
  sola operación se bloquea (`alsoBeingDisabled`), porque si no cada chequeo
  veía al otro todavía activo.
- **Sin contraseña temporal** (Sprint 2, pedido del usuario: "quiero que llegue link para crear contraseña"):
  un usuario creado desde el panel nace con una contraseña aleatoria que nadie conoce y recibe por correo
  un enlace de invitación (72 h) para elegir la suya. La respuesta de `create` trae
  `invitation: { url, expiresAt, emailConfigured }`: si el correo no llega o no está configurado, el admin
  copia el enlace y lo manda por WhatsApp. Antes nacía con "123456" y quien supiera su correo podía entrar
  antes que él; la migración `20261113100000` dejó inutilizable esa contraseña en los usuarios que nunca la
  cambiaron (entran con el enlace o con "¿Olvidaste tu contraseña?").
- `POST /user/:id/password-link` con `purpose`: `invite` (72 h) o `reset` (30 min). Mismo alcance que editar
  (`userBelongsToCaller`: empresa y tienda del que llama; 403 si no). Un enlace nuevo anula los anteriores.
  Usuario deshabilitado → 409 `USER_DISABLED`. Detalle de los enlaces en `auth/README.md`.
- `must_change_password` queda solo para usuarios viejos: el middleware `requirePasswordChanged` los obliga
  a cambiarla antes de usar el resto de la API.
- Bloqueo por intentos fallidos: al alcanzar el máximo (`>=`, no `===`) se
  bloquea por `lockout_minutes`. La comparación por igualdad era un bug: tras
  el primer bloqueo el contador seguía subiendo y nunca volvía a coincidir,
  así que el usuario quedaba sin protección de fuerza bruta.

## Campos especiales
- `company_id` efectivo: si el usuario tiene tienda, manda la empresa de la
  tienda; si no, su `company_id` directo (mismo criterio en
  `getUserTenantInfo`, `assertUserBelongsToCaller` y
  `resolveTargetUserCompanyId`).

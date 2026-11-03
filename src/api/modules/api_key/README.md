# Módulo: api_key (API keys de integración)

Autenticación para integraciones **sin sesión** (hoy: la web pública que
envía pedidos de cotización, ver
[`web_quote_request/README.md`](../web_quote_request/README.md)). Una key
por integración, ligada a una empresa y opcionalmente a una tienda.

## Código de módulo (RBAC)
`api_key` — **exclusivo del Super Administrador** (pedido explícito del
usuario: "que solo pueda ver el super admin"):
- Está en `SYSTEM_ONLY_MODULE_CODES` (`core/rbac/systemOnlyModules.ts`): no
  aparece en el menú de un usuario de empresa y no se le puede otorgar a un
  rol de empresa desde Roles y accesos.
- Todas sus rutas llevan `requireSystemRole` además de `verifyAccess`.
- El seeder `20261103110000-seed-api-key-module.js` no lo otorga a ningún rol
  (un rol `is_system` ya tiene todo).

## Endpoints
| Método | Ruta                    | Acción                        | Requiere              |
|--------|-------------------------|-------------------------------|-----------------------|
| GET    | /api-key/list           | list (pag, filtros)           | api_key + system role |
| POST   | /api-key/create         | create (devuelve la key 1 vez)| api_key + system role |
| PUT    | /api-key/update/:id     | update (nombre, tienda)       | api_key + system role |
| PUT    | /api-key/disable/:id    | revocar (de una sola vía)     | api_key + system role |

Filtros de `list`: `companyId`, `status` (`active` | `revoked` | `all`, por
defecto `all`), `name` (contiene). Orden: más recientes primero.

## Vistas de frontend vinculadas
- `api_key.list` → `/configuracion/api-keys` (menú Configuración, ícono `key`).

## Botones/acciones vinculadas
- `api_key.create.button`
- `api_key.update.button`
- `api_key.disable.button`

## Reglas de negocio
- **La key completa se devuelve UNA sola vez** (`plain_key` en la respuesta
  de crear). En la base solo queda su SHA-256 (`key_hash`, único) y un
  prefijo (`key_prefix`, 12 caracteres) para reconocerla. Ningún otro
  endpoint devuelve la key ni su hash. Si se pierde: revocar y crear otra.
- La **empresa no se cambia** al editar (otra empresa = otra key). La tienda
  sí, y debe ser una tienda activa de esa empresa (si no → 400).
- **Revocar es de una sola vía** (soft-delete `is_deleted = true`): una key se
  revoca porque se filtró o ya no se usa, y reactivarla volvería a abrir el
  acceso a quien la tenga. Revocar otra vez o editar una revocada → 409
  `API_KEY_REVOKED`. Por eso la pantalla usa confirmación antes de revocar
  (no es el toggle reversible de los demás catálogos).
- Solo autentica si la key, su empresa y su tienda (si tiene) están activas.
- `revoked_at` en la respuesta = `updated_at` de una key revocada (después de
  revocarla ya no se modifica).
- Fechas en UTC en la base; salen como `{ date, time }` de Lima.

## Respaldo por script
`npm run api-key -- create|list|revoke` (`scripts/api-key.js`, incluido en el
paquete de producción) hace lo mismo sin pantalla. Replica exactamente el
formato de `services/shared/api_key_hash.ts`.

## Piezas
- `model/api_key.model.ts` — tabla `api_key`.
- `services/shared/api_key_hash.ts` — generar/hashear.
- `services/shared/api_key_mapper.ts` — SELECT + DTO (sin hash).
- `core/middlewares/requireApiKey.ts` — valida `X-Api-Key` y deja `req.apiKey`.

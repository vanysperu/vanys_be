# Módulo: variable_general

## Código de módulo (RBAC)
`variable_general`

## Endpoints
| Método | Ruta                          | Acción         | Requiere módulo   |
|--------|-------------------------------|----------------|-------------------|
| GET    | /variable_general/list        | list (pag)     | variable_general  |
| GET    | /variable_general/detail/:id  | getById        | variable_general  |
| POST   | /variable_general/create      | create         | variable_general  |
| PUT    | /variable_general/update/:id  | update         | variable_general  |
| PUT    | /variable_general/disable/:id | disable        | variable_general  |
| DELETE | /variable_general/delete/:id  | delete (legacy)| variable_general  |

## Vistas de frontend vinculadas
- variable_general.list (`/configuracion/variables-generales`)

## Botones/acciones vinculadas
- variable_general.create.button
- variable_general.update.button
- variable_general.disable.button
- variable_general.delete.button (legacy, ver "Notas" abajo)

## Reglas de negocio propias del módulo
- `company_id = NULL` significa variable **global**, visible para todas las
  empresas (ej. tipos de documento, etapas de producción por defecto). Solo
  un usuario `is_system` puede crear/editar/deshabilitar una fila con
  `company_id NULL`; un usuario de empresa siempre queda forzado a la suya.
- El listado en modo "select" (`admin=false`) solo devuelve `{value, name}`
  para alimentar `<select>` de otros formularios (no pagina igual que la
  pantalla de administración).
- Deshabilitar es un **toggle** (`is_deleted`): el mismo endpoint habilita o
  deshabilita según el estado actual, igual que en `client`/`product`.

## Campos especiales
- Auditoría (`created_by`, `created_at`, `updated_by`, `updated_at`) y
  soft-delete (`is_deleted`) fueron agregados en la migración
  `20260922100000-add-audit-and-soft-delete-general-variable.js` — la tabla
  original (`general_variable`) no los tenía.

## Notas
- El endpoint `DELETE /variable_general/delete/:id` (borrado físico) es
  **legacy**: el frontend (`VariableGeneralPage.tsx`) ya no lo usa, fue
  reemplazado por `PUT /variable_general/disable/:id` (soft-delete vía
  `ToggleStatusButton`), conforme a CLAUDE.md sección 1 ("disable es SIEMPRE
  soft-delete, no existe acción delete física por defecto"). El endpoint
  físico se dejó en el backend sin remover para no romper compatibilidad
  con integraciones externas que pudieran depender de él; se recomienda
  removerlo en un cambio futuro explícito una vez confirmado que nada más
  lo usa.

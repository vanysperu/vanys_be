# Módulo: resource (Catálogo de recursos: vistas, botones y endpoints)

## Código de módulo (RBAC)
`roles_access` — **exclusivo del Super Administrador** (ver
`src/core/rbac/systemOnlyModules.ts` y el README de `role`).

## Endpoints
| Método | Ruta                   | Acción            | Requiere módulo / guard             |
|--------|------------------------|-------------------|-------------------------------------|
| GET    | /resource/list         | list (pag)        | roles_access + `requireSystemRole`  |
| GET    | /resource/:id          | detail            | roles_access + `requireSystemRole`  |
| POST   | /resource/create       | create            | roles_access + `requireSystemRole`  |
| PUT    | /resource/update/:id   | update            | roles_access + `requireSystemRole`  |
| PUT    | /resource/disable/:id  | disable (toggle)  | roles_access + `requireSystemRole`  |

## Vistas de frontend vinculadas
- roles_access.list

## Botones/acciones vinculadas
- roles_access.resource.create.button
- roles_access.resource.update.button
- roles_access.resource.disable.button

## Reglas de negocio propias del módulo
- Catálogo compartido de plataforma: leerlo y modificarlo es exclusivo del
  Super Administrador.
- `(route, verb)` es único: un mismo endpoint pertenece a un solo módulo.
  Por eso `GET /role/list` se mudó (no se duplicó) al módulo users.
- `disable` es soft-delete (`active`).

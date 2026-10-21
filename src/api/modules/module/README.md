# Módulo: module (Catálogo de módulos)

## Código de módulo (RBAC)
`roles_access` — **exclusivo del Super Administrador** (ver
`src/core/rbac/systemOnlyModules.ts` y el README de `role`).

## Endpoints
| Método | Ruta                 | Acción            | Requiere módulo / guard             |
|--------|----------------------|-------------------|-------------------------------------|
| GET    | /module/list         | list (pag)        | roles_access + `requireSystemRole`  |
| POST   | /module/create       | create            | roles_access + `requireSystemRole`  |
| PUT    | /module/update/:id   | update            | roles_access + `requireSystemRole`  |
| PUT    | /module/disable/:id  | disable (toggle)  | roles_access + `requireSystemRole`  |

## Vistas de frontend vinculadas
- roles_access.list

## Botones/acciones vinculadas
- roles_access.module.create.button
- roles_access.module.update.button
- roles_access.module.disable.button

## Reglas de negocio propias del módulo
- Catálogo compartido de plataforma (CLAUDE.md sección 10): no pertenece a
  ninguna empresa. Leerlo y modificarlo es exclusivo del Super
  Administrador.
- `disable` es soft-delete (`active`).

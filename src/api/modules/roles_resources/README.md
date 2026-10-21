# Módulo: roles_resources (Accesos por rol)

## Código de módulo (RBAC)
`roles_access` — **exclusivo del Super Administrador** (ver
`src/core/rbac/systemOnlyModules.ts` y el README de `role`).

## Endpoints
| Método | Ruta                       | Acción                        | Requiere módulo / guard             |
|--------|----------------------------|-------------------------------|-------------------------------------|
| GET    | /roles/:roleId/resources   | árbol módulos → recursos      | roles_access + `requireSystemRole`  |
| PUT    | /roles/:roleId/resources   | otorgar / quitar (`add`/`remove`) | roles_access + `requireSystemRole` |

## Vistas de frontend vinculadas
- roles_access.list (diálogo "Gestionar accesos")

## Botones/acciones vinculadas
- roles_access.assign.button

## Reglas de negocio propias del módulo
- Un rol `is_system` se considera con todos los recursos otorgados (no
  necesita filas en `roles_resources`).
- Al configurar un rol de empresa, el árbol **no ofrece** lo exclusivo del
  Super Administrador. La excepción es "Ver todas las tiendas"
  (`roles_access.viewAllBusinessUnits.button`): es un permiso de alcance de
  datos y sí se otorga a roles de empresa; aparece en la raíz de su módulo.
- Otorgar algo exclusivo se ignora en silencio, para cualquier rol y aunque
  lo pida el propio Super Administrador.
- Se mantiene, como defensa en profundidad, "no puedes otorgar lo que tú no
  tienes" para un caller que no sea `is_system`.
- Guardar es transaccional: altas y bajas se aplican juntas o ninguna.

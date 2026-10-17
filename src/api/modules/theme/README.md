# Módulo: theme

## Código de módulo (RBAC)
`platform` (reutiliza el módulo de plataforma ya usado por la gestión de
empresas/tiendas — mismo nivel de acceso, `is_system`)

## Endpoints
| Método | Ruta         | Acción           | Requiere módulo |
|--------|--------------|------------------|------------------|
| GET    | /theme/list  | listar paletas   | ninguno (cualquier autenticado) |

`PUT /company/update/:id` (módulo `company`) acepta `theme_color` para
asignarle una paleta a una empresa — no hay un endpoint propio de escritura,
el catálogo `themes` es fijo (se inserta por migración/seeder).

## Vistas de frontend vinculadas
- `platform.company.theme.view` — hoy es la vista "Empresas" (crear/editar/
  deshabilitar empresas, incluye el color de marca). El `code` y la `route`
  del resource se mantienen igual a los originales para no romper el
  matching de rutas; solo se renombró el `name` visible en el menú (ver
  seeder `20260916170000-rename-company-theme-view.js`).

## Botones/acciones vinculadas
- (ninguno; el select de paleta es parte del formulario de edición de
  empresa, no requiere un botón granular propio)

## Reglas de negocio propias del módulo
- `themes` es un catálogo cerrado (5 paletas iniciales: blue/violet/green/
  orange/rose). No tiene alta desde la API a propósito: cada fila requiere
  también un bloque CSS correspondiente en
  `grulla_fe/src/_metronic/assets/sass/theme/_theme-colors.scss` con los 5
  valores derivados (base/active/light/clarity/inverse) — agregar una fila
  sin su bloque CSS dejaría la paleta a medias. Agregar una paleta nueva es
  un cambio de código + migración, no un CRUD de negocio.
- `company.theme_color` tiene FK a `themes.code` — solo puede apuntar a una
  paleta existente.

## Campos especiales
- `primary_clarity_color` se guarda como `rgba(r,g,b,0.2)` en vez de hex,
  igual que en el resto del sistema de colores de Metronic.

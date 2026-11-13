# Módulo: production_workflow (Flujo de producción)

Sprint 2, ítem 5. Pedido del usuario: "que los estados del kanban de productos
dentro de cotización uno pueda personalizar qué columnas quiere y el orden de
flujo". Decisiones D10 (modos Lineal y Libre) y D11 (por empresa).

Antes las etapas eran filas de `general_variable` (category `production_stage`):
4 globales que ninguna empresa podía ocultar ni reordenar. La migración
`20261113120000-create-production-workflow.js` copia a cada empresa las etapas
que veía, en el mismo orden, pasa cada producto a su etapa equivalente y da de
baja las filas viejas.

## Código de módulo (RBAC)
`production_workflow` (id preferido 23). Seeder:
`20261113120100-seed-production-workflow-module.js`.

## Endpoints
| Método | Ruta                         | Acción | Recurso |
|--------|------------------------------|--------|---------|
| GET    | /production-workflow/config  | configuración completa (reglas + todas las columnas con su cantidad de productos) | `production_workflow.get.endpoint` |
| PUT    | /production-workflow/config  | guarda reglas + columnas en orden (transacción) | `production_workflow.update.button` |
| GET    | /production-workflow/board   | reglas + columnas activas para el kanban de una cotización | `production_workflow.board.endpoint` (cuelga de Cotizaciones) |

`companyId` (query) / `company_id` (body): solo lo usa el Super Administrador,
que elige la empresa en la pantalla. A un usuario de empresa se le ignora y se
usa la suya (CLAUDE.md sección 10).

No hay listado paginado: una empresa tiene como máximo 40 columnas.

## Vistas de frontend vinculadas
- `production_workflow.view` → `/configuracion/flujo-produccion` (menú
  Configuración, después de "Documentos de la empresa").

## Botones/acciones vinculadas
- `production_workflow.update.button` — guardar el flujo.

## Quién recibe qué (seeder)
- Configuración (vista, ver y guardar): los roles con
  `document_settings.update.button` (Administrador). Es configuración: nunca
  el Gestor (CLAUDE.md sección 11.1).
- Tablero (`/board`): los roles con `cotizacion.find.endpoint`, Gestor incluido.

## Tablas
- `production_workflow` — una fila por empresa (`company_id` UNIQUE):
  `flow_mode` (`linear` | `free`) y `allow_backward`.
- `production_workflow_stage` — columnas: `name`, `color` (hex), `position`,
  `category` (`todo` | `doing` | `done`, como las categorías de estado de
  Jira: cada empresa nombra sus columnas como quiera y el sistema igual sabe
  cuáles son "terminado"), `active`, `legacy_variable_id` (fila de
  `general_variable` que reemplazó).
- `quotation_item_stage_log` — cada movimiento de un producto (desde, hacia,
  quién y cuándo). Inmutable. El ingreso a la primera columna al crear la
  cotización no se registra: su hora es `quotation_item.created_at`.

Todas con los 4 campos de auditoría y `company_id`.

## Reglas de negocio
- **Modo lineal**: un producto solo pasa a la columna siguiente, o a la
  anterior si `allow_backward`. Un producto sin columna (o en una que se
  desactivó) entra por la primera.
- **Modo libre**: a cualquier columna activa.
- Mover a la misma columna en la que ya está no hace nada (doble clic, dos
  pestañas).
- Solo se mueve la producción de una cotización Aceptada o En curso (regla que
  ya existía, `assertQuotationIsActive`).
- Las columnas **no se borran** (hay historial que las usa): se desactivan. Al
  guardar tienen que venir todas las existentes, una vez cada una.
- Al menos 1 columna activa, máximo 12 activas y 40 en total; sin nombres
  repetidos entre las activas (sin importar mayúsculas).
- Desactivar una columna que tiene productos exige `moveItemsToStageId` (una
  columna existente que queda activa): los productos pasan ahí y el movimiento
  queda en `quotation_item_stage_log`.
- Una empresa sin flujo (creada después de la migración) recibe al primer uso
  las 4 columnas de siempre: Diseño (por hacer), Insumos y Producción (en
  curso), Listo (terminado). El UNIQUE de `company_id` y un bloqueo de fila
  evitan duplicarlas con dos requests simultáneos.
- Guardar es todo o nada (`sequelize.transaction`) con la fila de
  configuración bloqueada: dos administradores guardando a la vez no se pisan a
  medias.

## Campos especiales
- `color` se guarda en mayúsculas (`#1F5FC0`).
- El orden lo da el arreglo `stages` del PUT (`position` = índice).

## Pruebas
`tests/production-workflow.test.ts` (empresa desechable: no cambia el flujo de
"Acme Corp QA", que las demás suites usan en modo lineal).

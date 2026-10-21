# Módulo: statistics (Estadísticas)

## Código de módulo (RBAC)
`statistics` (módulo 18, "Estadísticas"; en el menú va justo después de "Inicio").

## Endpoints
| Método | Ruta                   | Acción                     | Requiere módulo |
|--------|------------------------|----------------------------|-----------------|
| GET    | /statistics/overview   | tablero completo (lectura) | statistics      |

Módulo de **solo lectura**: no tiene tabla propia ni create/update/disable.
Todo sale de agregados en SQL sobre `quotation`, `quotation_item`,
`quotation_payment`, `quotation_expense` y `cash_movement`, en una sola
respuesta (las consultas corren en paralelo; ninguna trae filas sueltas a
memoria).

Parámetros: `dateFrom`/`dateTo` (YYYY-MM-DD, hora de Lima, inclusivos; los
dos o ninguno; por defecto los últimos 30 días; máximo 3 años),
`businessUnitId` (solo si el usuario no está atado a una tienda) y
`companyId` (solo lo respeta un Super Administrador).

## Vistas de frontend vinculadas
- statistics.view (`/estadisticas`)

## Botones/acciones vinculadas
- Ninguno (solo lectura).

## Reglas de negocio propias del módulo
- Pedido explícito del usuario: "estadísticas que en verdad nos sirvan".
- **Periodo de comparación**: el inmediatamente anterior de la MISMA
  duración (los últimos 30 días se comparan con los 30 previos; un mes a medias
  no se compara contra un mes completo).
- **Cotización ganada** = `accepted`, `design_pending`, `in_process`, `ready`,
  `delivered`, `finished`. **Perdida** = `rejected`, `expired`, `cancelled`.
  **Tasa de conversión** = ganadas / (ganadas + perdidas): las pendientes de
  respuesta no cuentan (todavía no se decidieron).
- Métricas de cotizaciones (cotizado, aceptado, estados, rankings, vendedores)
  usan la **fecha de emisión** (created_at en hora de Lima).
- Métricas de caja (cobrado, otros ingresos, gastos, flujo neto, tendencia de
  ingresos/egresos, cobros por cuenta) usan la **fecha del movimiento**
  (`paid_at`, `spent_at`, `occurred_at`) y el **mismo filtro que Caja**, para
  que ambos módulos cuadren (cubierto por prueba).
- **Margen estimado** = subtotal sin IGV de las ganadas del periodo − gastos
  registrados en esas cotizaciones. Es estimado: un gasto aún no cargado no
  cuenta.
- **Por cobrar por antigüedad** es una foto de hoy (no depende del periodo):
  mismo universo que el módulo Por cobrar, por días desde la emisión.
- Rankings: top 5 clientes y top 6 productos/técnicas por cotizaciones ganadas;
  cobros por cuenta con máximo 6 barras (el resto se junta en "Otras
  cuentas"); vendedores = quien creó la cotización (máx. 20).
- La tendencia agrupa por día hasta 62 días y por mes en rangos más largos;
  siempre trae todos los tramos (con ceros) para que la gráfica no salte.
- **Alcance**: empresa y tienda salen de la sesión (CLAUDE.md 10 y 11.1). Es
  una vista de gestión: el seeder la otorga solo al rol plantilla
  "Administrador"; si se le da a un rol atado a una tienda, ve solo su tienda.

## Campos especiales
- Índices agregados para estas consultas (migración
  `20261021120000-add-statistics-indexes`): `quotation(company_id,
  created_at)`, `quotation_payment(paid_at)`, `quotation_expense(spent_at)`.
- Frontend: gráficas con Recharts (vía el `Chart` de shadcn/ui) y colores de
  una paleta validada para daltonismo y contraste (tokens `--viz-*` en
  `grulla_fe/src/index.css`).

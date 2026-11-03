# Módulo: money_correction

Historial **inmutable** de correcciones de dinero de todas las fuentes de Caja
("editar en el lugar + historial", decidido con el usuario). No expone
endpoints propios ni código RBAC: es una librería interna que usa el endpoint
de corrección / historial de cada módulo (cash_movement, payment, quotation,
purchase_order, employee_debt), que es quien aplica `authorize`/`verifyAccess`
y el alcance de empresa/tienda.

## Código de módulo (RBAC)
Ninguno (sin endpoints). Los recursos de corrección/historial viven en el
módulo de cada fuente — ver `database/seeders/20261101110100-seed-money-correction-resources.js`.

## Tabla `money_correction`
Migración `20261101110000-money-correction-and-annulments.js` (reemplaza a
`cash_movement_correction`, cuyas filas se copiaron con `source_type = 'manual'`).

| Columna | Notas |
|---|---|
| `company_id` | NOT NULL, FK RESTRICT |
| `business_unit_id` | NULL, FK SET NULL |
| `source_type` | `manual`, `quotation_payment`, `quotation_expense` (también compras: su gasto), `employee_debt`, `employee_debt_payment` — mismos nombres que `source` de Caja |
| `source_id` | id de la fila en la tabla de su fuente (sin FK) |
| `kind` | `correction` (default); `adjustment` reservado para el cierre mensual |
| `previous_values` / `new_values` | JSON con solo lo que cambió + fotos derivadas (nombre de cuenta, asignaciones, deuda...) |
| `reason` | 5–500 caracteres (CHECK en la base y validación en `recordMoneyCorrection`) |
| auditoría | `created_*` = `updated_*` (la fila nunca se edita ni se borra) |

Índices: `(source_type, source_id, created_at)`, `(company_id, created_at)`, `(business_unit_id)`.

## API interna
- `services/create/money_correction.service.ts` → `recordMoneyCorrection(input)`: siempre dentro de la transacción de la corrección.
- `services/find/money_correction.service.ts` → `listMoneyCorrections({ sourceType, sourceId, page, limit })` (paginado, más reciente primero; NO valida alcance) y `MONEY_CORRECTION_VALUE_KEYS` (lista blanca de claves por fuente al leer el JSON; MySQL lo devuelve parseado, MariaDB como texto).
- `services/shared/correction_diff.ts` → `applyRequested`, `changedFieldsBetween`, `pickFields`, `assertHasChanges` (400 `NO_CHANGES`), `toNullableId`, `toNullableText`, `toMoneyValue`.
- `services/shared/corrections_count.ts` → `correctionsCountSql(source, "alias.col")` (subconsulta para SQL crudo, entradas en lista blanca) y `loadCorrectionCounts(source, ids)` (una consulta agrupada → `Map<id, n>`), para el badge "Corregido (n)" sin N+1.
- `validators/money_correction.validator.ts` → `correctionReasonRule()`, `correctionIdParamRule(param)`, `correctionHistoryValidator`.

Ganchos compartidos relacionados (fuera del módulo):
- `core/rbac/writeScope.ts` → `resolveWriteScope(user)` / `isOutOfWriteScope(record, scope)`: alcance de escritura (un gestor con tienda escribe solo en la suya aunque pueda ver todas).
- `core/money/cashPeriod.ts` → `assertCashPeriodOpen(...)`: no-op hasta el cierre mensual (fase 2).
- `employee_debt/services/shared/debt_state.service.ts` → `recalculateDebtsState(debtIds, transaction, updatedBy)`.

## Vistas de frontend vinculadas
Ninguna propia. El kit compartido vive en `grulla_fe/src/modules/moneyCorrections/`.

## Botones/acciones vinculadas
Ninguno propio.

## Reglas de negocio propias del módulo
- Una corrección sin motivo (5–500) no se guarda.
- Las filas nunca se actualizan ni se borran.
- `kind = 'correction'` por defecto.

## Campos especiales
- `created_at` sale como ISO + `created_date`/`created_time` de Lima por separado.

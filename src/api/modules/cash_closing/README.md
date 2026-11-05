# Módulo: cash_closing (Cierres de caja)

Cierre mensual de caja por **empresa** (no por tienda): saldo inicial declarado
por cuenta, cierre de cada mes en orden, reapertura con motivo y saldos actuales
por cuenta (Efectivo, bancos, Yape, Plin). Un mes cerrado queda fijo: si después
se corrige una fila suya, la fila se corrige en el lugar y la diferencia se
registra con dos patas de ajuste (`cash_adjustment_entry`): "Valor al cierre"
(hold, fecha original) y "Ajuste" (posting, hoy). Ver `core/money/cashPeriod.ts`.

## Código de módulo (RBAC)
`cash_closing` (sembrado por `database/seeders/20261102100100-seed-cash-closing-module.js`).

## Endpoints
Montado en `/cash-closing`. Todas las rutas llevan `verifyAccess` (resource por
`route` + `verb`). Super Administrador: `?companyId=` en GET y `company_id` en el
body de PUT (obligatorio → 400 `COMPANY_REQUIRED`). Usuario de empresa: siempre
la suya. El acceso lo da el ROL: los resources de cierre se otorgan solo a
administradores, que ven y cierran la caja de TODA su empresa aunque su usuario tenga una tienda asignada (Admin ≠ Super Admin: el Admin solo su empresa). El gestor solo tiene `/status`; el resto le responde 403 (`verifyAccess`).

| Método | Ruta | Acción | Resource |
|---|---|---|---|
| GET | /cash-closing/status | estado: inicio, meses cerrados/reabiertos, hoy | `cash_closing.status.endpoint` |
| GET | /cash-closing/list?page&limit | meses desde el inicio hasta el actual (desc, paginado; vacío sin caja) | `cash_closing.list.endpoint` |
| GET | /cash-closing/find/:period | detalle: foto guardada o vista previa + blockers/warnings/counts | `cash_closing.find.endpoint` |
| GET | /cash-closing/:period/adjustments?type=posted\|affecting&page&limit | patas posting del mes / patas hold que lo protegen | `cash_closing.adjustments.endpoint` |
| GET | /cash-closing/:period/events?page&limit | rastro (en el mes de inicio, también `opening_set`) | `cash_closing.events.endpoint` |
| GET | /cash-closing/balances | saldos actuales por cuenta | `cash_closing.balances.button` |
| GET | /cash-closing/opening?startPeriod= | saldo inicial + pista por cuenta | `cash_closing.opening.endpoint` |
| PUT | /cash-closing/opening | configurar/editar saldo inicial | `cash_closing.opening.button` |
| PUT | /cash-closing/close/:period | cerrar / volver a cerrar | `cash_closing.close.button` |
| PUT | /cash-closing/reopen/:period | reabrir (motivo 5–500) | `cash_closing.reopen.button` |
| — | (capacidad, sin endpoint) POST /cash-closing/adjust | corregir/anular filas de meses cerrados | `cash_closing.adjust.button` |

`:period` = `AAAA-MM`. Las rutas fijas se registran antes que `/:period/...`.

**Sin acción `disable`** (excepción documentada a CLAUDE.md §1): los cierres son
inmutables; la reapertura cumple ese papel y queda auditada.

### Bodies
- `PUT /opening`: `{ company_id?, start_period, openings: [{ payment_account_id: number|null, amount }], notes? }`
  (montos con signo, 2 decimales; cada cuenta una vez; las cuentas no enviadas
  conservan su valor; una cuenta sin fila = 0).
- `PUT /close/:period`: `{ company_id?, notes? }`.
- `PUT /reopen/:period`: `{ company_id?, reason }`.
Las tres responden **200** con el recurso actualizado (opening → `CashOpeningResponse`;
close/reopen → `CashPeriodDetail`).

### Códigos de error
| Código | HTTP | Cuándo |
|---|---|---|
| `CASH_LEDGER_NOT_STARTED` | 409 | cerrar/reabrir/ver un mes sin saldo inicial |
| `CASH_PERIOD_BEFORE_START` | 400 | mes anterior al inicio |
| `CASH_PERIOD_IN_FUTURE` | 400 | detalle/ajustes/eventos de un mes posterior al actual |
| `CASH_PERIOD_NOT_ENDED` | 409 | el mes todavía no terminó (Lima) |
| `CASH_PERIOD_ALREADY_CLOSED` | 409 | ya está cerrado |
| `CASH_PERIOD_PREVIOUS_OPEN` | 409 | el mes anterior no está cerrado |
| `CASH_PERIOD_EARLIER_REOPENED` | 409 | hay un mes anterior reabierto (o el anterior está reabierto) |
| `CASH_PERIOD_NOT_CLOSED` | 409 | reabrir un mes que no está cerrado |
| `INVALID_REASON` | 400 | motivo de reapertura fuera de 5–500 |
| `CASH_PERIOD_DRIFT` | 409 | al re-cerrar, un mes cerrado posterior cambió sus movimientos (bug; se loguea y se revierte todo) |
| `CASH_OPENING_LOCKED` | 409 | editar el saldo inicial con el mes de inicio cerrado |
| `CASH_START_PERIOD_LOCKED` | 409 | cambiar el mes de inicio cuando ya hubo algún cierre |
| `CASH_START_PERIOD_INVALID` | 400 | mes de inicio futuro o absurdo |
| `CASH_LEDGER_CONFLICT` | 409 | dos "configurar caja" simultáneos |
| `COMPANY_REQUIRED` | 400 | Super Administrador sin empresa |

## Vistas de frontend vinculadas
- `cash_closing.list` → `/caja/cierres`

## Botones/acciones vinculadas
- `cash_closing.balances.button` (panel "Saldos de caja" en Caja)
- `cash_closing.opening.button`
- `cash_closing.close.button`
- `cash_closing.reopen.button`
- `cash_closing.adjust.button` (capacidad: corregir/anular filas de meses cerrados)

## Reglas de negocio propias del módulo
- **Por empresa**. Las patas llevan tienda, así Caja filtrada por tienda cuadra.
- **Saldo inicial** declarado por cuenta a las 00:00 del 1.º del mes de inicio
  (sugerido: el último mes terminado). La pista `history_amount` = neto de Caja
  antes de esa fecha; nunca se usa sola. Lo anterior al inicio es "pre-ledger":
  sin candados ni ajustes. Editable mientras el mes de inicio no está cerrado
  (o está reabierto); el mes de inicio solo cambia mientras no hubo ningún cierre.
- **Cerrar**: el mes terminó (Lima), el anterior está cerrado (o es el inicio) y no
  hay ningún mes anterior reabierto. Sin espera obligatoria: en los días 1–5 del mes
  siguiente solo hay una advertencia. Otras advertencias: saldo final negativo,
  meses que un re-cierre recalcularía.
- **Números**: `cierre = inicial + ingresos − egresos + ajustes` por cuenta, con
  `getCashFlowSummary` de Caja (mismo cálculo; ningún SQL propio). Inicial = cierre
  guardado del mes anterior, o el saldo declarado en el mes de inicio. Cuentas = las
  del saldo inicial ∪ las con movimiento; una cuenta que queda en cero conserva su
  fila (nunca se borran).
- **Re-cerrar** (mes reabierto): recalcula ese mes y cada mes cerrado seguido
  posterior (solo su inicial/cierre; ingresos/egresos/ajustes se verifican iguales →
  si no, `CASH_PERIOD_DRIFT`). Evento `recalculate` por mes.
- **Reabrir**: los meses cerrados después siguen cerrados (`is_provisional`).
- **Saldo actual** = cierre del ancla (último mes de la cadena cerrada contigua
  desde el inicio) o el saldo declarado + todo lo posterior. `base_label` y
  `provisional_note` lo explican.
- **Locks** (plan §2.4): cerrar/reabrir/saldo inicial corren en una transacción
  READ COMMITTED cuya primera sentencia es `cash_ledger … FOR UPDATE`; después solo
  leen y escriben tablas `cash_*`. Las escrituras de dinero toman el libro en SHARE
  al final: un cierre espera a las que están en curso (entran al cierre) y las que
  llegan después ven el mes cerrado.
- Cada acción deja un evento inmutable (`cash_period_event`) y una fila de `log`
  (módulo `cash_closing`).
- **Limitación**: Caja filtrada por **categoría** no incluye patas (no tienen categoría).

## Campos especiales
- Montos DECIMAL(14,2) (pueden ser negativos en saldos). Fechas de evento:
  `{ date, time }` de Lima.
- `GET /:period/adjustments` agrega `posted_date` (fecha de la diferencia) a
  `CashPeriodAdjustmentItem`.
- En `find/:period`, `totals` de una vista previa son los en vivo; de un mes
  cerrado, los guardados.
- Una cuenta usada en `cash_ledger_opening`, `cash_period_balance` o
  `cash_adjustment_entry` no se elimina (409 `PAYMENT_ACCOUNT_IN_USE`).

## Neto de cada mes
La lista (`/cash-closing/list`) y el detalle (`/cash-closing/find/:period`) traen `finance`:
resultado del mes, IGV estimado y neto después del IGV (ver
`cash_movement/README.md` → "Resultado del mes e IGV"). En un mes cerrado, ingresos,
egresos y ajustes salen de sus totales guardados; el IGV se recalcula (el cierre no lo guarda).
Se calcula para toda la página en una tanda (`services/shared/period_finance.service.ts`).

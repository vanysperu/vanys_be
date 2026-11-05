import { PeriodFinance } from "../../cash_movement/services/shared/period_finance";
import { MoneyCorrectionKind, MoneyCorrectionSource } from "../../money_correction/types/money_correction.types";

// Tipos del cierre mensual de caja (fase 2). Montos hacia el cliente: soles
// (number con 2 decimales). Montos internos de cálculo: céntimos enteros
// (sufijo `Cents`), igual que core/utils/money.ts.

export type CashDirection = "income" | "expense";

// ---------------------------------------------------------------------------
// Enumeraciones guardadas en la base (migración 20261102100000).
// ---------------------------------------------------------------------------

// Estado guardado de un mes: solo existe fila en cash_period cuando el mes se
// cerró al menos una vez. Un mes sin fila está abierto.
export const CASH_PERIOD_STORED_STATUSES = ["closed", "reopened"] as const;
export type CashPeriodStoredStatus = (typeof CASH_PERIOD_STORED_STATUSES)[number];

export const CASH_PERIOD_EVENT_ACTIONS = ["opening_set", "close", "reclose", "reopen", "recalculate"] as const;
export type CashPeriodEventAction = (typeof CASH_PERIOD_EVENT_ACTIONS)[number];

// hold = mantiene el mes cerrado tal como se cerró (fecha original);
// posting = lleva la diferencia al mes abierto (fecha del día en que se corrigió).
export const CASH_ADJUSTMENT_LEGS = ["hold", "posting"] as const;
export type CashAdjustmentLegType = (typeof CASH_ADJUSTMENT_LEGS)[number];

// ---------------------------------------------------------------------------
// Estados calculados (lecturas).
// ---------------------------------------------------------------------------

// Estado de un mes en la lista de cierres.
export type CashPeriodListStatus = "open" | CashPeriodStoredStatus;

// Estado del mes de UNA fila de Caja:
//   no_ledger  = la empresa no configuró la caja (sin restricciones);
//   pre_ledger = fecha anterior al mes de inicio (fuera del libro);
//   open / reopened / closed = estado del mes de la fila.
export type CashRowPeriodStatus = "no_ledger" | "pre_ledger" | "open" | "reopened" | "closed";

// Tipo de fila de Caja: un movimiento real o una de las dos patas de un ajuste.
export type CashEntryKind = "movement" | "closing_hold" | "adjustment";

// Qué hizo la corrección que generó un ajuste.
export type CashAdjustmentAction = "correction" | "annul" | "restore";

// Cuenta: 0 = Efectivo, si no el id de la cuenta (payment_account_id).
export const CASH_ACCOUNT_KEY = 0;
export const CASH_ACCOUNT_NAME = "Efectivo";

// ---------------------------------------------------------------------------
// Núcleo del cálculo de ajustes (cash_effects + planAdjustmentLegs).
// ---------------------------------------------------------------------------

/**
 * Efecto en caja de UNA fila de una fuente (o de una asignación, en una
 * reposición), tal como lo cuenta Caja. `amountCents` siempre > 0; el signo lo
 * da `direction`.
 */
export interface CashEffect {
  date: string; // YYYY-MM-DD
  direction: CashDirection;
  amountCents: number;
  paymentAccountId: number | null; // null = Efectivo
  businessUnitId: number | null;
  quotationId: number | null;
  purchaseOrderId: number | null;
}

/**
 * Una pata de ajuste a insertar en cash_adjustment_entry. `amountCents` lleva
 * signo, relativo a `direction` (un ingreso de -20 = 20 menos de ingreso).
 */
export interface AdjustmentLeg {
  leg: CashAdjustmentLegType;
  affectedPeriod: string; // YYYY-MM del mes cerrado que se protege
  entryDate: string; // hold = fecha original; posting = hoy (Lima)
  direction: CashDirection;
  amountCents: number; // != 0, con signo
  paymentAccountId: number | null;
  businessUnitId: number | null;
  quotationId: number | null;
  purchaseOrderId: number | null;
}

// ---------------------------------------------------------------------------
// Respuestas de la API /cash-closing (plan §5). WP-A puede AGREGAR campos
// (nunca quitar ni cambiar el tipo de uno existente: el frontend los usa).
// ---------------------------------------------------------------------------

export interface DateTimeParts {
  date: string; // YYYY-MM-DD (Lima)
  time: string; // HH:mm (Lima)
}

// GET /cash-closing/status (y `cash_period` del listado de Caja).
export interface CashPeriodStatus {
  started: boolean;
  start_period: string | null;
  start_date: string | null;
  // Primer día después del último mes cerrado (desde ahí todo está abierto).
  // null si no hay ningún mes cerrado.
  first_open_date: string | null;
  closed_periods: string[]; // ascendente
  reopened_periods: string[]; // ascendente
  today: string; // YYYY-MM-DD (Lima)
}

export interface CashPeriodTotals {
  opening: number;
  income: number;
  expense: number;
  adjustments: number;
  closing: number;
}

// Una cuenta dentro de un mes (snapshot guardado o vista previa).
export interface CashPeriodAccountBalance {
  account_key: number;
  payment_account_id: number | null;
  account_name: string;
  opening: number;
  income: number;
  expense: number;
  adjustments: number;
  closing: number;
}

// Foto guardada en cash_period_event.snapshot / previous_snapshot de un
// cierre, re-cierre, reapertura o recálculo.
export interface CashPeriodSnapshot {
  period: string;
  totals: CashPeriodTotals;
  balances: CashPeriodAccountBalance[];
}

// Foto de un evento opening_set (saldo inicial).
export interface CashOpeningSnapshot {
  start_period: string;
  start_date: string;
  notes: string | null;
  openings: {
    account_key: number;
    payment_account_id: number | null;
    account_name: string;
    amount: number;
    history_amount: number | null;
  }[];
}

export type CashPeriodEventSnapshot = CashPeriodSnapshot | CashOpeningSnapshot;

// Bloqueo (impide cerrar) o advertencia (solo informa) de un mes.
export interface CashClosingIssue {
  code: string;
  message: string;
}

// GET /cash-closing/list (una fila por mes, desde el inicio hasta el mes actual).
export interface CashClosingListItem {
  period: string;
  label: string; // "octubre 2026"
  status: CashPeriodListStatus;
  closable: boolean;
  blocked_reason: string | null;
  // Mes cerrado DESPUÉS de un mes reabierto: su saldo inicial se recalculará.
  is_provisional: boolean;
  totals: CashPeriodTotals | null; // null = nunca se cerró
  close_count: number;
  closed_by_name: string | null;
  closed_at: DateTimeParts | null;
  reopened_by_name: string | null;
  reopened_at: DateTimeParts | null;
  reopen_reason: string | null;
  // Resultado del mes, IGV estimado y neto después del IGV (ver
  // cash_movement/services/shared/period_finance.ts). null solo si no se pudo calcular.
  finance: PeriodFinance | null;
}

// GET /cash-closing/find/:period
export interface CashPeriodDetail extends CashClosingListItem {
  period_start: string;
  period_end: string;
  // true = mes abierto o reabierto: los números son una vista previa en vivo.
  is_preview: boolean;
  close_notes: string | null;
  balances: CashPeriodAccountBalance[];
  blockers: CashClosingIssue[];
  warnings: CashClosingIssue[];
  counts: { adjustments_posted: number; adjustments_affecting: number };
}

// GET /cash-closing/:period/adjustments (una pata de ajuste).
export interface CashPeriodAdjustmentItem {
  id: number; // id de cash_adjustment_entry
  money_correction_id: number;
  source_type: MoneyCorrectionSource;
  source_id: number;
  leg: CashAdjustmentLegType;
  action: CashAdjustmentAction;
  affected_period: string;
  affected_period_label: string;
  entry_date: string;
  direction: CashDirection;
  amount: number; // con signo, relativo a direction
  net_effect: number; // efecto en el saldo: income ? amount : -amount
  payment_account_id: number | null;
  payment_account_name: string;
  business_unit_id: number | null;
  quotation_id: number | null;
  purchase_order_id: number | null;
  reason: string;
  created_by_name: string | null;
  created_at: DateTimeParts;
}

// GET /cash-closing/:period/events
export interface CashPeriodEventItem {
  id: number;
  period: string | null;
  action: CashPeriodEventAction;
  reason: string | null;
  snapshot: CashPeriodEventSnapshot | null;
  previous_snapshot: CashPeriodEventSnapshot | null;
  created_by: number;
  created_by_name: string | null;
  created_at: DateTimeParts;
}

// GET /cash-closing/balances
export interface CashBalanceAccount {
  account_key: number;
  payment_account_id: number | null;
  name: string;
  base_balance: number;
  income: number;
  expense: number;
  adjustments: number;
  current_balance: number;
}

export interface CashBalancesResponse {
  started: boolean;
  as_of: string; // hoy (Lima)
  base_period: string | null; // último mes de la cadena cerrada; null = saldo inicial
  base_label: string | null; // "Cierre de octubre 2026" | "Saldo inicial al 01/10/2026"
  provisional_note: string | null;
  accounts: CashBalanceAccount[];
  totals: Omit<CashBalanceAccount, "account_key" | "payment_account_id" | "name">;
}

// GET /cash-closing/opening
export interface CashOpeningAccount {
  account_key: number;
  payment_account_id: number | null;
  name: string;
  active: boolean;
  amount: number | null; // saldo declarado; null = todavía no declarado
  history_amount: number; // pista: neto de Caja antes de start_date
}

export interface CashOpeningResponse {
  started: boolean;
  start_period: string; // el guardado o, si no hay libro, el sugerido (último mes terminado)
  start_date: string;
  notes: string | null;
  editable: boolean; // los montos se pueden cambiar
  start_period_editable: boolean; // el mes de inicio se puede cambiar
  accounts: CashOpeningAccount[];
}

// ---------------------------------------------------------------------------
// Entradas de los services (los controllers las arman desde req, ya validadas).
// ---------------------------------------------------------------------------

export interface SetCashOpeningInput {
  companyId: number;
  startPeriod: string;
  openings: { payment_account_id: number | null; amount: number }[];
  notes?: string | null;
  actorId: number;
}

export interface CloseCashPeriodInput {
  companyId: number;
  period: string;
  notes?: string | null;
  actorId: number;
}

export interface ReopenCashPeriodInput {
  companyId: number;
  period: string;
  reason: string;
  actorId: number;
}

// Resumen del ajuste en una fila de Caja (item.adjustment).
export interface CashRowAdjustmentInfo {
  correction_id: number;
  affected_period: string;
  posted_date: string;
  action: CashAdjustmentAction;
  previous_amount: number | null;
  new_amount: number | null;
  reason: string;
  created_by_name: string | null;
}

// Resultado de CashChange.complete() (core/money/cashPeriod.ts).
export interface CashChangeResult {
  kind: MoneyCorrectionKind;
  adjustedPeriod: string | null; // primer mes cerrado afectado (null = sin ajuste)
  affectedPeriods: string[];
  postedDate: string | null; // fecha de las patas posting (hoy) o null
  entriesCount: number;
}

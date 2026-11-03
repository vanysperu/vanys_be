import { Transaction } from "sequelize";

// Fuentes de dinero que se pueden corregir: exactamente los mismos nombres
// que la columna `source` de Caja (ver cash_movement/services/find). Una
// compra de orden se registra como "quotation_expense" (su gasto, que es la
// fila que muestra Caja), con source_id = id del gasto.
export const MONEY_CORRECTION_SOURCES = [
  "manual",
  "quotation_payment",
  "quotation_expense",
  "employee_debt",
  "employee_debt_payment",
] as const;

export type MoneyCorrectionSource = (typeof MONEY_CORRECTION_SOURCES)[number];

// 'adjustment' queda reservado para el cierre mensual de caja (fase 2).
export const MONEY_CORRECTION_KINDS = ["correction", "adjustment"] as const;

export type MoneyCorrectionKind = (typeof MONEY_CORRECTION_KINDS)[number];

export const isMoneyCorrectionSource = (value: unknown): value is MoneyCorrectionSource =>
  typeof value === "string" && (MONEY_CORRECTION_SOURCES as readonly string[]).includes(value);

// Foto de una asignación de reposición a una deuda (antes/después de
// corregir una reposición o el monto de una compra).
export interface AllocationSnapshot {
  employee_debt_id: number;
  amount: number;
}

// Valores de una foto del historial: solo los campos que cambiaron, más
// datos derivados guardados como texto del momento (nombre de la cuenta, del
// trabajador, asignaciones, monto/estado de la deuda...), así el historial se
// lee igual aunque después se renombre o deshabilite algo.
export type MoneyCorrectionValues = Record<string, string | number | null | AllocationSnapshot[]>;

export interface RecordMoneyCorrectionInput {
  sourceType: MoneyCorrectionSource;
  sourceId: number;
  companyId: number;
  businessUnitId: number | null;
  previous: MoneyCorrectionValues;
  next: MoneyCorrectionValues;
  reason: string;
  actorId: number;
  kind?: MoneyCorrectionKind;
  // Obligatoria: la fila del historial va en la MISMA transacción que la
  // corrección (si algo falla, no queda ni el cambio ni el historial).
  transaction: Transaction;
}

// Una fila del historial tal como sale hacia el cliente. Fechas: instante UTC
// (ISO) + fecha/hora de Lima por separado (CLAUDE.md: fechas UTC-5 separadas).
export interface MoneyCorrectionListItem {
  id: number;
  source_type: MoneyCorrectionSource;
  source_id: number;
  kind: MoneyCorrectionKind;
  previous_values: MoneyCorrectionValues;
  new_values: MoneyCorrectionValues;
  reason: string;
  created_by: number;
  created_by_name: string | null;
  created_at: string;
  created_date: string;
  created_time: string;
  // Solo en kind='adjustment' (cierre de caja): dónde y cuándo se registró la
  // diferencia en el mes abierto. null en una corrección normal. Opcional
  // para no obligar a otros constructores del tipo.
  adjustment?: MoneyCorrectionAdjustmentSummary | null;
}

// Diferencia registrada (patas posting) por cuenta, de UN ajuste.
export interface MoneyCorrectionAdjustmentPosting {
  payment_account_id: number | null; // null = Efectivo
  payment_account_name: string;
  direction: "income" | "expense";
  amount: number; // con signo, relativo a direction
  net_effect: number; // efecto en el saldo: income ? amount : -amount
}

export interface MoneyCorrectionAdjustmentSummary {
  // Primer mes cerrado protegido (YYYY-MM) — atajo de affected_periods[0].
  affected_period: string | null;
  affected_periods: string[]; // YYYY-MM de los meses cerrados protegidos (ascendente)
  posted_date: string | null; // fecha de las patas posting (YYYY-MM-DD, Lima)
  // Efecto total en el saldo de las patas posting (todas las cuentas).
  net_effect: number;
  // Nombre de la cuenta si la diferencia cayó en UNA sola; null si en varias.
  account_name: string | null;
  postings: MoneyCorrectionAdjustmentPosting[];
}

export interface ListMoneyCorrectionsInput {
  sourceType: MoneyCorrectionSource;
  sourceId: number;
  page: number;
  limit: number;
}

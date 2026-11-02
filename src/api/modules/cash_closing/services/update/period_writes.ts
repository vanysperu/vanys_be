import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { toCents } from "../../../../../core/utils/money";
import { createLogService } from "../../../logs/services/create/log.services";
import { LogAction } from "../../../logs/model/log.model";
import {
  CashPeriodAccountBalance,
  CashPeriodEventAction,
  CashPeriodEventSnapshot,
  CashPeriodTotals,
} from "../../types/cash_closing.types";

// Escrituras compartidas por cerrar / re-cerrar / recalcular / reabrir /
// saldo inicial. Siempre dentro de la transacción del caller (que ya tiene el
// libro FOR UPDATE).

/**
 * Agrega una fila en cero por cada cuenta que estaba guardada y ya no aparece
 * (un re-cierre nunca borra filas: una cuenta que queda en cero conserva su
 * fila en cero).
 */
export function withStoredAccounts(
  fresh: CashPeriodAccountBalance[],
  stored: Map<number, CashPeriodAccountBalance>
): CashPeriodAccountBalance[] {
  const freshKeys = new Set(fresh.map((row) => row.account_key));
  const missing = [...stored.values()]
    .filter((row) => !freshKeys.has(row.account_key))
    .map((row) => ({ ...row, opening: 0, income: 0, expense: 0, adjustments: 0, closing: 0 }));
  return [...fresh, ...missing];
}

/**
 * Inserta o actualiza los saldos de un mes en UNA sentencia (INSERT … ON
 * DUPLICATE KEY UPDATE sobre UNIQUE(cash_period_id, account_key)). Nunca toca
 * created_by/created_at de una fila existente.
 */
export async function upsertPeriodBalances({
  companyId,
  cashPeriodId,
  balances,
  actorId,
  now,
  transaction,
}: {
  companyId: number;
  cashPeriodId: number;
  balances: CashPeriodAccountBalance[];
  actorId: number;
  now: Date;
  transaction: Transaction;
}): Promise<void> {
  if (balances.length === 0) return;
  await DataBase.instance.cash_period_balance.bulkCreate(
    balances.map((row) => ({
      company_id: companyId,
      cash_period_id: cashPeriodId,
      account_key: row.account_key,
      payment_account_id: row.payment_account_id,
      account_name: row.account_name.slice(0, 150),
      opening: row.opening,
      income: row.income,
      expense: row.expense,
      adjustments: row.adjustments,
      closing: row.closing,
      created_by: actorId,
      created_at: now,
      updated_by: actorId,
      updated_at: now,
    })),
    {
      transaction,
      updateOnDuplicate: [
        "payment_account_id",
        "account_name",
        "opening",
        "income",
        "expense",
        "adjustments",
        "closing",
        "updated_by",
        "updated_at",
      ],
    }
  );
}

// Columnas de totales de cash_period.
export const totalsColumns = (totals: CashPeriodTotals) => ({
  opening_total: totals.opening,
  income_total: totals.income,
  expense_total: totals.expense,
  adjustment_total: totals.adjustments,
  closing_total: totals.closing,
});

/**
 * Cuentas cuyo ingreso, egreso o ajustes difieren entre lo guardado y lo
 * recalculado (en céntimos). Un mes cerrado nunca debería cambiar (las patas
 * "Valor al cierre" lo protegen): si cambia es un bug (I5).
 */
export function driftedAccounts(
  stored: Map<number, CashPeriodAccountBalance>,
  fresh: CashPeriodAccountBalance[]
): number[] {
  const freshByKey = new Map(fresh.map((row) => [row.account_key, row]));
  const keys = new Set([...stored.keys(), ...freshByKey.keys()]);
  const differs = (a: number | undefined, b: number | undefined) => toCents(a ?? 0) !== toCents(b ?? 0);
  return [...keys].filter((key) => {
    const before = stored.get(key);
    const after = freshByKey.get(key);
    return (
      differs(before?.income, after?.income) ||
      differs(before?.expense, after?.expense) ||
      differs(before?.adjustments, after?.adjustments)
    );
  });
}

export async function insertPeriodEvent({
  companyId,
  period,
  action,
  reason,
  previousSnapshot,
  snapshot,
  actorId,
  now,
  transaction,
}: {
  companyId: number;
  period: string | null;
  action: CashPeriodEventAction;
  reason: string | null;
  previousSnapshot: CashPeriodEventSnapshot | null;
  snapshot: CashPeriodEventSnapshot;
  actorId: number;
  now: Date;
  transaction: Transaction;
}): Promise<void> {
  await DataBase.instance.cash_period_event.create(
    {
      company_id: companyId,
      period,
      action,
      reason: reason === null ? null : reason.slice(0, 500),
      previous_snapshot: previousSnapshot,
      snapshot,
      created_by: actorId,
      created_at: now,
      updated_by: actorId,
      updated_at: now,
    },
    { transaction }
  );
}

export async function logCashClosing({
  actorId,
  companyId,
  description,
  transaction,
}: {
  actorId: number;
  companyId: number;
  description: string;
  transaction: Transaction;
}): Promise<void> {
  await createLogService(
    { user_id: actorId, action: LogAction.UPDATE, module: "cash_closing", description, company_id: companyId },
    transaction
  );
}

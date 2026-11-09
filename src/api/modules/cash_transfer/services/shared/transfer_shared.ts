import { QueryTypes, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { CASH_CLOSING_ERROR_CODES } from "../../../../../core/money/cashPeriod";
import { isOutOfWriteScope, WriteScope } from "../../../../../core/rbac/writeScope";
import {
  capitalizeEs,
  formatPeriodEs,
  periodOf,
  toDateOnlyString,
  utcToBusinessParts,
} from "../../../../../utils/dateUtils";
import { CASH_ACCOUNT_NAME } from "../../../cash_closing/types/cash_closing.types";
import {
  acquireLedgerShareLock,
  findPeriodShareLocked,
} from "../../../cash_closing/services/shared/period_state.service";
import { CashTransferModel } from "../../model/cash_transfer.model";
import { CashTransferItem } from "../../types/cash_transfer.types";

// Mismo nombre de cuenta en las dos puntas: no es una transferencia.
export const SAME_ACCOUNT_ERROR_CODE = "CASH_TRANSFER_SAME_ACCOUNT";

export function assertDistinctAccounts(fromId: number | null, toId: number | null): void {
  if (fromId !== toId) return;
  throw new AppError(
    400,
    "La cuenta de origen y la de destino tienen que ser distintas",
    undefined,
    SAME_ACCOUNT_ERROR_CODE
  );
}

/**
 * Transferencia bloqueada (FOR UPDATE) y dentro del alcance de ESCRITURA del
 * usuario. Fuera de alcance responde igual que un id que no existe (404): no
 * se confirma que exista en otra empresa o tienda.
 */
export async function lockTransferInScope(
  transferId: number,
  scope: WriteScope,
  transaction: Transaction
): Promise<CashTransferModel> {
  const transfer = await DataBase.instance.cash_transfer.findOne({
    where: { id: transferId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!transfer || isOutOfWriteScope(transfer, scope)) throw new AppError(404, "La transferencia no existe");
  return transfer;
}

/**
 * Candado del cierre de caja para una transferencia: si la fecha cae en un mes
 * CERRADO, no se registra, corrige ni anula (409 CASH_PERIOD_CLOSED). A
 * diferencia de un movimiento suelto, una transferencia no genera patas de
 * ajuste: no cambia el saldo de la empresa, solo el de cada cuenta, así que
 * para tocar una de un mes cerrado se reabre ese mes (queda auditado).
 *
 * Mismo protocolo de locks que el resto de las escrituras de dinero: se llama
 * DESPUÉS de bloquear la fila propia y toma el libro LOCK IN SHARE MODE al
 * final. Sin libro, o antes del mes de inicio, no restringe nada.
 */
export async function assertTransferDateOpen(
  companyId: number,
  date: string,
  transaction: Transaction
): Promise<void> {
  const ledger = await acquireLedgerShareLock(companyId, transaction);
  if (!ledger) return;
  if (date < ledger.startDate) return;

  const period = periodOf(date);
  const state = await findPeriodShareLocked(companyId, period, transaction);
  if (state?.status !== "closed") return;

  throw new AppError(
    409,
    `${capitalizeEs(formatPeriodEs(period))} ya está cerrado: una transferencia de ese mes no se puede registrar, ` +
      "corregir ni anular. Pide a un administrador que reabra el mes.",
    { period },
    CASH_CLOSING_ERROR_CODES.periodClosed
  );
}

interface TransferRow {
  id: number | string;
  company_id: number | string;
  business_unit_id: number | string | null;
  from_payment_account_id: number | string | null;
  from_account_name: string | null;
  to_payment_account_id: number | string | null;
  to_account_name: string | null;
  amount: string | number;
  occurred_at: string | Date;
  description: string | null;
  operation_number: string | null;
  is_deleted: number | boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

const nullableId = (value: number | string | null): number | null => (value === null ? null : Number(value));

// Nombre de la cuenta para mostrar: Efectivo si no hay cuenta.
const accountLabel = (id: number | string | null, name: string | null): string =>
  id === null ? CASH_ACCOUNT_NAME : (name ?? "Cuenta");

export const toTransferItem = (row: TransferRow): CashTransferItem => ({
  id: Number(row.id),
  company_id: Number(row.company_id),
  business_unit_id: nullableId(row.business_unit_id),
  from_payment_account_id: nullableId(row.from_payment_account_id),
  from_account_name: accountLabel(row.from_payment_account_id, row.from_account_name),
  to_payment_account_id: nullableId(row.to_payment_account_id),
  to_account_name: accountLabel(row.to_payment_account_id, row.to_account_name),
  amount: Number(row.amount),
  occurred_at: toDateOnlyString(row.occurred_at),
  description: row.description,
  operation_number: row.operation_number,
  is_deleted: Number(row.is_deleted) === 1,
  // Auditoría: se guarda en UTC y sale como fecha/hora de Lima por separado.
  created_at: utcToBusinessParts(row.created_at),
  updated_at: utcToBusinessParts(row.updated_at),
});

// SELECT común (con los nombres de las cuentas): texto fijo del código.
export const TRANSFER_SELECT_SQL = `
  SELECT t.id, t.company_id, t.business_unit_id, t.from_payment_account_id, fa.name AS from_account_name,
         t.to_payment_account_id, ta.name AS to_account_name, t.amount, t.occurred_at, t.description,
         t.operation_number, t.is_deleted, t.created_at, t.updated_at
  FROM cash_transfer t
  LEFT JOIN general_variable fa ON fa.id = t.from_payment_account_id
  LEFT JOIN general_variable ta ON ta.id = t.to_payment_account_id`;

/** Una transferencia con los nombres de sus cuentas (dentro de la transacción del caller). */
export async function loadTransferItem(transferId: number, transaction?: Transaction): Promise<CashTransferItem> {
  const [row] = await DataBase.instance.sequelize.query<TransferRow>(`${TRANSFER_SELECT_SQL} WHERE t.id = :transferId`, {
    type: QueryTypes.SELECT,
    replacements: { transferId },
    transaction,
  });
  if (!row) throw new AppError(404, "La transferencia no existe");
  return toTransferItem(row);
}

export type { TransferRow };

// "S/ 1,234.50 de BCP a Efectivo" (texto del log).
export const describeTransfer = (item: Pick<CashTransferItem, "amount" | "from_account_name" | "to_account_name">): string =>
  `S/ ${item.amount.toFixed(2)} de ${item.from_account_name} a ${item.to_account_name}`;

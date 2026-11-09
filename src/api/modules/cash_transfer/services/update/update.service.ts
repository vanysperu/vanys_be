import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { nowUtc, toDateOnlyString } from "../../../../../utils/dateUtils";
import { createLogService } from "../../../logs/services/create/log.services";
import { LogAction } from "../../../logs/model/log.model";
import { toMoneyValue, toNullableText } from "../../../money_correction/services/shared/correction_diff";
import { resolvePaymentAccountId } from "../../../variable_general/services/shared/payment_account.service";
import { CashTransferModel } from "../../model/cash_transfer.model";
import { CashTransferItem, UpdateCashTransferChanges, UpdateCashTransferInput } from "../../types/cash_transfer.types";
import {
  assertDistinctAccounts,
  assertTransferDateOpen,
  describeTransfer,
  loadTransferItem,
  lockTransferInScope,
} from "../shared/transfer_shared";

interface TransferValues {
  amount: number;
  occurred_at: string;
  from_payment_account_id: number | null;
  to_payment_account_id: number | null;
  description: string | null;
  operation_number: string | null;
}

// Campos que cambian el saldo de alguna cuenta: tocarlos exige que el mes de
// la transferencia (y el nuevo, si cambia la fecha) esté abierto.
const CASH_FIELDS: (keyof TransferValues)[] = ["amount", "occurred_at", "from_payment_account_id", "to_payment_account_id"];

const LABELS: Record<keyof TransferValues, string> = {
  amount: "monto",
  occurred_at: "fecha",
  from_payment_account_id: "cuenta de origen",
  to_payment_account_id: "cuenta de destino",
  description: "descripción",
  operation_number: "N.° de operación",
};

const valuesOf = (transfer: CashTransferModel): TransferValues => ({
  amount: toMoneyValue(transfer.amount),
  occurred_at: toDateOnlyString(transfer.occurred_at),
  from_payment_account_id: transfer.from_payment_account_id === null ? null : Number(transfer.from_payment_account_id),
  to_payment_account_id: transfer.to_payment_account_id === null ? null : Number(transfer.to_payment_account_id),
  description: transfer.description,
  operation_number: transfer.operation_number,
});

// Cuenta nueva: de la empresa y activa. Conservar la MISMA cuenta aunque se
// haya deshabilitado después sí se permite (mismo criterio que corregir un pago).
const resolveAccount = async (
  requested: number | null | undefined,
  current: number | null,
  companyId: number,
  transaction: Transaction
): Promise<number | null> => {
  if (requested === undefined) return current;
  if (requested === current) return current;
  return resolvePaymentAccountId({ accountId: requested, companyId, required: false, transaction });
};

const nextValuesOf = async (
  previous: TransferValues,
  changes: UpdateCashTransferChanges,
  companyId: number,
  transaction: Transaction
): Promise<TransferValues> => ({
  amount: changes.amount === undefined ? previous.amount : toMoneyValue(changes.amount),
  occurred_at: changes.occurred_at ?? previous.occurred_at,
  from_payment_account_id: await resolveAccount(
    changes.from_payment_account_id,
    previous.from_payment_account_id,
    companyId,
    transaction
  ),
  to_payment_account_id: await resolveAccount(changes.to_payment_account_id, previous.to_payment_account_id, companyId, transaction),
  description: changes.description === undefined ? previous.description : toNullableText(changes.description),
  operation_number: changes.operation_number === undefined ? previous.operation_number : toNullableText(changes.operation_number),
});

const changedFields = (previous: TransferValues, next: TransferValues): (keyof TransferValues)[] =>
  (Object.keys(LABELS) as (keyof TransferValues)[]).filter((field) => previous[field] !== next[field]);

/**
 * Corrige una transferencia en el lugar (mismo criterio que corregir un
 * movimiento manual): solo los campos enviados, con motivo obligatorio. El
 * "antes → después" y el motivo quedan en `log`, inmutable, en la misma
 * transacción.
 */
export async function updateCashTransferService({
  transferId,
  changes,
  reason,
  scope,
  actorId,
}: UpdateCashTransferInput): Promise<CashTransferItem> {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const transfer = await lockTransferInScope(transferId, scope, transaction);
    // Una transferencia anulada primero se reactiva (igual que un movimiento).
    if (transfer.is_deleted) {
      throw new AppError(409, "La transferencia está anulada: reactívala antes de corregirla", undefined, "CASH_TRANSFER_ANNULLED");
    }

    const companyId = Number(transfer.company_id);
    const previous = valuesOf(transfer);
    const next = await nextValuesOf(previous, changes, companyId, transaction);
    const changed = changedFields(previous, next);
    if (changed.length === 0) throw new AppError(400, "No hay cambios para guardar", undefined, "NO_CHANGES");
    assertDistinctAccounts(next.from_payment_account_id, next.to_payment_account_id);

    // Solo lo que mueve saldos pasa por el candado del cierre: la fecha
    // original y la nueva tienen que estar en meses abiertos.
    if (changed.some((field) => CASH_FIELDS.includes(field))) {
      await assertTransferDateOpen(companyId, previous.occurred_at, transaction);
      if (next.occurred_at !== previous.occurred_at) await assertTransferDateOpen(companyId, next.occurred_at, transaction);
    }

    const before = await loadTransferItem(transferId, transaction);
    await DataBase.instance.cash_transfer.update(
      { ...next, updated_by: actorId, updated_at: nowUtc() },
      { where: { id: transferId }, transaction }
    );
    const after = await loadTransferItem(transferId, transaction);

    const summary = changed.map((field) => LABELS[field]).join(", ");
    await createLogService(
      {
        user_id: actorId,
        action: LogAction.UPDATE,
        module: "cash_transfer",
        description:
          `Corrigió la transferencia #${transferId} (${summary}). Antes: ${describeTransfer(before)} el ${before.occurred_at}. ` +
          `Ahora: ${describeTransfer(after)} el ${after.occurred_at}. Motivo: ${reason}`,
        company_id: companyId,
      },
      transaction
    );
    return after;
  });
}

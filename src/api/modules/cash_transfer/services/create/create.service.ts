import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { createLogService } from "../../../logs/services/create/log.services";
import { LogAction } from "../../../logs/model/log.model";
import { CashTransferItem, CreateCashTransferInput } from "../../types/cash_transfer.types";
import {
  assertDistinctAccounts,
  assertTransferDateOpen,
  describeTransfer,
  loadTransferItem,
} from "../shared/transfer_shared";

/**
 * Registra una transferencia entre dos cuentas de la empresa. Una sola fila y
 * su log en la misma transacción: si el log falla, la transferencia tampoco
 * queda (CLAUDE.md §12, rollback).
 */
export async function createCashTransferService(input: CreateCashTransferInput): Promise<CashTransferItem> {
  assertDistinctAccounts(input.fromPaymentAccountId, input.toPaymentAccountId);

  return DataBase.instance.sequelize.transaction(async (transaction) => {
    // Una transferencia nueva no entra en un mes ya cerrado.
    await assertTransferDateOpen(input.companyId, input.occurredAt, transaction);

    const now = nowUtc();
    const created = await DataBase.instance.cash_transfer.create(
      {
        company_id: input.companyId,
        business_unit_id: input.businessUnitId,
        from_payment_account_id: input.fromPaymentAccountId,
        to_payment_account_id: input.toPaymentAccountId,
        amount: input.amount,
        occurred_at: input.occurredAt,
        description: input.description,
        operation_number: input.operationNumber,
        is_deleted: false,
        created_by: input.actorId,
        created_at: now,
        updated_by: input.actorId,
        updated_at: now,
      },
      { transaction }
    );

    const item = await loadTransferItem(Number(created.id), transaction);
    await createLogService(
      {
        user_id: input.actorId,
        action: LogAction.CREATE,
        module: "cash_transfer",
        description: `Registró la transferencia #${item.id}: ${describeTransfer(item)} (${item.occurred_at})`,
        company_id: input.companyId,
      },
      transaction
    );
    return item;
  });
}

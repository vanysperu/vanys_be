import { DataBase } from "../../../../../database";
import { nowUtc, toDateOnlyString } from "../../../../../utils/dateUtils";
import { createLogService } from "../../../logs/services/create/log.services";
import { LogAction } from "../../../logs/model/log.model";
import { CashTransferItem, DisableCashTransferInput } from "../../types/cash_transfer.types";
import {
  assertDistinctAccounts,
  assertTransferDateOpen,
  describeTransfer,
  loadTransferItem,
  lockTransferInScope,
} from "../shared/transfer_shared";

/**
 * Anula o reactiva una transferencia (soft-delete con `is_deleted`, nunca un
 * DELETE). Cada cambio deja una fila inmutable en `log` dentro de la MISMA
 * transacción, igual que el toggle de un movimiento manual: anular y reactivar
 * varias veces deja todo el rastro.
 *
 * Una transferencia de un mes cerrado no se anula ni se reactiva (409): hay
 * que reabrir el mes (ver assertTransferDateOpen).
 */
export async function disableCashTransferService({
  transferId,
  scope,
  actorId,
}: DisableCashTransferInput): Promise<CashTransferItem> {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    // Fila bloqueada: dos toggles simultáneos no leen el mismo estado previo.
    const transfer = await lockTransferInScope(transferId, scope, transaction);
    const nextIsDeleted = !transfer.is_deleted;

    // Reactivar revalida que las cuentas sigan siendo distintas (la base
    // también lo exige con un CHECK).
    if (!nextIsDeleted) assertDistinctAccounts(transfer.from_payment_account_id, transfer.to_payment_account_id);
    await assertTransferDateOpen(Number(transfer.company_id), toDateOnlyString(transfer.occurred_at), transaction);

    await DataBase.instance.cash_transfer.update(
      { is_deleted: nextIsDeleted, updated_by: actorId, updated_at: nowUtc() },
      { where: { id: transferId }, transaction }
    );

    const item = await loadTransferItem(transferId, transaction);
    await createLogService(
      {
        user_id: actorId,
        action: nextIsDeleted ? LogAction.DISABLE : LogAction.ACTIVE,
        module: "cash_transfer",
        description: `${nextIsDeleted ? "Anuló" : "Reactivó"} la transferencia #${transferId}: ${describeTransfer(item)} (${item.occurred_at})`,
        company_id: item.company_id,
      },
      transaction
    );
    return item;
  });
}

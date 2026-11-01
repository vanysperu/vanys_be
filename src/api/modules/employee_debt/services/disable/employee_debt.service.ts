import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { formatSoles } from "../../../../../core/utils/money";
import { createLogService } from "../../../logs/services/create/log.services";
import { LogAction } from "../../../logs/model/log.model";

export class EmployeeDebtNotFoundError extends Error {}
export class EmployeeDebtNotCancellableError extends Error {}

// Anula una deuda MANUAL registrada por error. Reglas para que no se pueda
// descuadrar nada:
//   - solo deudas manuales: la de una compra existe porque la compra existe
//     (se corrige desde su orden de compra, no desde acá);
//   - solo si todavía no se le repuso NADA: si ya hubo reposición, primero
//     se anula esa reposición (las deudas vuelven a pendiente) y recién
//     entonces la deuda;
//   - es de una sola vía y deja rastro en `log`.
const cancelManualEmployeeDebt = async ({
  debtId,
  companyId,
  cancelledBy,
}: {
  debtId: number;
  // null = Super Administrador (cualquier empresa).
  companyId: number | null;
  cancelledBy: number;
}) => {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const debt = await DataBase.instance.employee_debt.findOne({
      where: { id: debtId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!debt || (companyId !== null && debt.company_id !== companyId)) {
      throw new EmployeeDebtNotFoundError("La deuda no existe");
    }
    if (debt.origin !== "manual") {
      throw new EmployeeDebtNotCancellableError(
        "Esta deuda viene de una compra de orden: se corrige desde su orden de compra, no se anula acá."
      );
    }
    if (debt.status === "cancelled") throw new EmployeeDebtNotCancellableError("Esta deuda ya está anulada");
    if (Number(debt.paid_amount) > 0) {
      throw new EmployeeDebtNotCancellableError(
        `Ya se le repuso ${formatSoles(debt.paid_amount)} de esta deuda. Anula primero esa reposición y luego la deuda.`
      );
    }

    const now = nowUtc();
    await debt.update({ status: "cancelled", updated_by: cancelledBy, updated_at: now }, { transaction });

    await createLogService(
      {
        user_id: cancelledBy,
        action: LogAction.DISABLE,
        module: "employee_debt",
        description: `Anuló la deuda manual #${debtId} de ${formatSoles(debt.amount)} con el trabajador #${debt.user_id}: ${debt.description ?? ""}`,
        company_id: debt.company_id,
      },
      transaction
    );

    return { id: debtId, status: "cancelled" as const };
  });
};

export { cancelManualEmployeeDebt };

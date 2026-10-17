import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { createLogService } from "../../../logs/services/create/log.services";
import { LogAction } from "../../../logs/model/log.model";

/**
 * Anula o reactiva un movimiento de caja.
 *
 * Caja es un libro contable: antes este toggle solo volteaba `is_deleted` y
 * pisaba `updated_by`/`updated_at`, así que anular y reactivar el mismo
 * movimiento varias veces dejaba UN solo rastro (el último) y no había forma
 * de reconstruir quién sacó o devolvió ese monto, ni cuándo. Ahora cada
 * cambio deja una fila inmutable en `log` con el monto y el sentido del
 * movimiento, dentro de la MISMA transacción que el toggle: si el log falla,
 * el toggle tampoco se aplica.
 *
 * Se usa la tabla `log` que ya existe (user_id/action/module/description/
 * company_id) en vez de crear una tabla nueva solo para esto.
 */
const disableOrEnableCashMovementById = async ({
  movementId,
  updatedBy,
}: {
  movementId: number;
  updatedBy?: number;
}) => {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    // Se bloquea la fila para que dos toggles simultáneos no lean el mismo
    // estado previo y registren dos logs idénticos (o contradictorios).
    const movement = await DataBase.instance.cash_movement.findOne({
      where: { id: movementId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!movement) throw new Error("El movimiento no existe");

    const nextIsDeleted = !movement.is_deleted;

    await DataBase.instance.cash_movement.update(
      {
        is_deleted: nextIsDeleted,
        updated_by: updatedBy,
        updated_at: nowUtc(),
      },
      { where: { id: movementId }, transaction }
    );

    const direction = movement.direction === "income" ? "ingreso" : "egreso";
    const amount = Number(movement.amount).toFixed(2);

    await createLogService(
      {
        user_id: updatedBy ?? 0,
        action: nextIsDeleted ? LogAction.DISABLE : LogAction.ACTIVE,
        module: "cash_movement",
        description: nextIsDeleted
          ? `Anuló el ${direction} de S/ ${amount} (movimiento #${movementId})`
          : `Reactivó el ${direction} de S/ ${amount} (movimiento #${movementId})`,
        company_id: movement.company_id,
      },
      transaction
    );

    return { id: movementId, is_deleted: nextIsDeleted };
  });
};

export { disableOrEnableCashMovementById };

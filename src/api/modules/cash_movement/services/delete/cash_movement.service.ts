import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { beginCashChange, toggleAdjustmentValues } from "../../../../../core/money/cashPeriod";
import { isOutOfWriteScope, WriteScope } from "../../../../../core/rbac/writeScope";
import { nowUtc, toDateOnlyString } from "../../../../../utils/dateUtils";
import { createLogService } from "../../../logs/services/create/log.services";
import { LogAction } from "../../../logs/model/log.model";
import { recordMoneyCorrection } from "../../../money_correction/services/create/money_correction.service";
import { cashChangeNote } from "../update/cash_change_note";

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
 * Cierre de caja (fase 2): si el movimiento es de un mes CERRADO, anularlo o
 * restaurarlo es un AJUSTE: la fila se voltea igual, pero se registra el
 * historial (money_correction kind 'adjustment', con `reason` obligatorio) y
 * dos patas que mantienen el mes cerrado como se cerró y llevan la
 * diferencia al mes abierto. Sin libro o en un mes abierto, igual que antes
 * (el motivo se ignora).
 *
 * Se usa la tabla `log` que ya existe (user_id/action/module/description/
 * company_id) en vez de crear una tabla nueva solo para esto.
 */
const disableOrEnableCashMovementById = async ({
  movementId,
  scope,
  updatedBy,
  reason = null,
}: {
  movementId: number;
  // Alcance de ESCRITURA del usuario (resolveWriteScope): un gestor con "ver
  // todas las tiendas" solo anula en su propia tienda.
  scope: WriteScope;
  updatedBy: number;
  // Motivo del ajuste: solo se usa (y se exige) si el movimiento es de un mes
  // cerrado.
  reason?: string | null;
}) => {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    // Se bloquea la fila para que dos toggles simultáneos no lean el mismo
    // estado previo y registren dos logs idénticos (o contradictorios).
    const movement = await DataBase.instance.cash_movement.findOne({
      where: { id: movementId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    // Fuera de la empresa/tienda del usuario responde igual que un id que no
    // existe: no se confirma que exista en otra empresa o tienda.
    if (!movement || isOutOfWriteScope(movement, scope)) throw new AppError(404, "El movimiento no existe");

    const nextIsDeleted = !movement.is_deleted;
    // Auditoría: siempre el usuario real de la sesión, nunca 0.
    const actorId = updatedBy;
    const occurredAt = toDateOnlyString(movement.occurred_at);

    // Anular y restaurar mueven Caja en la fecha del movimiento: si es de un
    // mes cerrado, se registra como ajuste (después de bloquear la fila).
    const change = await beginCashChange({
      companyId: movement.company_id,
      source: "manual",
      sourceId: movementId,
      oldDate: occurredAt,
      newDate: occurredAt,
      movesCashAfter: !nextIsDeleted,
      scope,
      actorId,
      transaction,
    });

    await DataBase.instance.cash_movement.update(
      {
        is_deleted: nextIsDeleted,
        updated_by: updatedBy,
        updated_at: nowUtc(),
      },
      { where: { id: movementId }, transaction }
    );

    const cash = await change.complete(async (kind) => {
      // Un toggle normal no deja historial de corrección (solo el log).
      if (kind !== "adjustment" || reason === null) return null;
      const { previous, next } = toggleAdjustmentValues(nextIsDeleted);
      const correction = await recordMoneyCorrection({
        sourceType: "manual",
        sourceId: movementId,
        companyId: movement.company_id,
        businessUnitId: movement.business_unit_id,
        previous,
        next,
        reason,
        actorId,
        kind,
        transaction,
      });
      return correction.id;
    });

    const direction = movement.direction === "income" ? "ingreso" : "egreso";
    const amount = Number(movement.amount).toFixed(2);
    const note = cashChangeNote(cash);
    const reasonNote = cash.kind === "adjustment" && reason !== null ? `. Motivo: ${reason}` : "";

    await createLogService(
      {
        user_id: actorId,
        action: nextIsDeleted ? LogAction.DISABLE : LogAction.ACTIVE,
        module: "cash_movement",
        description: nextIsDeleted
          ? `Anuló el ${direction} de S/ ${amount} (movimiento #${movementId})${note}${reasonNote}`
          : `Reactivó el ${direction} de S/ ${amount} (movimiento #${movementId})${note}${reasonNote}`,
        company_id: movement.company_id,
      },
      transaction
    );

    return { id: movementId, is_deleted: nextIsDeleted, kind: cash.kind, adjusted_period: cash.adjustedPeriod };
  });
};

export { disableOrEnableCashMovementById };

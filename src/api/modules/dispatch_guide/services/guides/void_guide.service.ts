import { Op } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { nowUtc } from "../../../../../utils/dateUtils";
import { IToken } from "../../../../interfaces/IToken.interface";
import { cancelStockDocument } from "../../../inventory/services/documents/cancel_document.service";
import { logQuotationEvent } from "../../../quotation/services/timeline/quotation_event.service";
import type { GuideDto } from "../../types/dispatch_guide.types";
import { guideLabel, loadGuideForCaller, toGuideDto } from "./guide_shared";

/**
 * Anula una guía REGISTRADA (soft: queda "anulada" con su motivo). Lo hace un
 * administrador (RBAC). La baja en SUNAT se hace en SOL: el sistema solo la
 * registra. Si la guía generó una salida de almacén (D4), esa salida se anula
 * en la misma transacción y lo despachado vuelve a quedar pendiente.
 */
export const voidGuideService = async (id: number, reason: string, user: IToken): Promise<GuideDto> =>
  DataBase.instance.sequelize.transaction(async (transaction) => {
    const guide = await loadGuideForCaller(id, user, "write", transaction);
    if (guide.status !== "manual") throw new AppError(409, "Solo se anula una guía registrada", undefined, "GUIDE_NOT_REGISTERED");

    const exits = await DataBase.instance.stock_document.findAll({
      where: { dispatch_guide_id: guide.id, reversal_of_id: null, status: { [Op.ne]: "cancelled" } },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    for (const exit of exits) {
      await cancelStockDocument({ document: exit, reason: `Guía ${guideLabel(guide)} anulada`, actorId: user.userId, transaction });
    }

    const now = nowUtc();
    await guide.update(
      { status: "voided", voided_at: now, voided_by: user.userId, void_reason: reason.trim(), updated_by: user.userId, updated_at: now },
      { transaction }
    );
    if (guide.quotation_id !== null) {
      await logQuotationEvent({
        quotationId: Number(guide.quotation_id),
        action: "dispatch_guide_voided",
        description: `Guía de remisión ${guideLabel(guide)} anulada: ${reason.trim()}`.slice(0, 500),
        actorId: user.userId,
        transaction,
      });
    }
    return toGuideDto(guide, transaction);
  });

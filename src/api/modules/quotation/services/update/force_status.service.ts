import { Op, Transaction } from "sequelize";
import { AppError } from "../../../../../core/errors/AppError";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { createDeliveryExit } from "../../../inventory/services/integrations/delivery_exit";
import { QUOTATION_STATUS_LABEL, QuotationStatus } from "../../model/quotation.model";
import { computeDefaultValidUntil } from "../create/quotation.service";
import { logQuotationEvent } from "../timeline/quotation_event.service";
import { assertNoMoneyInvolved } from "./quotation.service";
import { assertRequestedQuotationIsComplete } from "./quotation_items.service";

// Cambio de estado "a mano" por un administrador (pedido del usuario, 21-nov:
// "los admin deberían poder mover las cotizaciones al estado que quieran y
// devolverlas"). Salta el mapa de transiciones de un paso
// (ALLOWED_TRANSITIONS), pero NO las reglas que protegen el dinero ni los
// datos: esas siguen aplicando igual que en el flujo normal.

export interface ForceQuotationStatusInput {
  quotationId: number;
  nextStatus: QuotationStatus;
  note: string | null;
  actorId: number;
}

export interface ForceQuotationStatusResult {
  status: QuotationStatus;
  // Lo que el cambio NO deshace solo y conviene revisar a mano.
  warnings: string[];
}

// Destinos que dejarían el dinero colgado (igual que el flujo normal, más
// "Vencida", que en el flujo normal solo la pone el job y solo sin pagos).
const MONEY_BLOCKED_TARGETS: Partial<Record<QuotationStatus, string>> = {
  rejected: "rechazar",
  cancelled: "cancelar",
  expired: "marcar como vencida",
  pending: "volver a Pendiente",
};

// Estados en los que la mercadería ya salió del almacén (salida por entrega).
const DELIVERED_STATUSES: QuotationStatus[] = ["delivered", "finished"];

// ¿Hay una salida de almacén por la entrega de esta cotización? (la que crea
// createDeliveryExit; una anulada no cuenta).
const hasDeliveryExit = async (quotationId: number, transaction: Transaction): Promise<boolean> => {
  const exit = await DataBase.instance.stock_document.findOne({
    where: { quotation_id: quotationId, doc_type: "exit", reason_code: "sale", status: { [Op.ne]: "cancelled" } },
    attributes: ["id"],
    transaction,
  });
  return exit !== null;
};

const hasIssuedInvoice = async (quotationId: number, transaction: Transaction): Promise<boolean> => {
  const invoice = await DataBase.instance.invoice.findOne({
    where: { quotation_id: quotationId, type: "issued" },
    attributes: ["id"],
    transaction,
  });
  return invoice !== null;
};

export async function forceQuotationStatus(input: ForceQuotationStatusInput): Promise<ForceQuotationStatusResult> {
  const { quotationId, nextStatus, note, actorId } = input;

  // Pendiente de cotizar es solo la entrada de un pedido de la web: volver
  // ahí no tiene sentido (sus productos ya se cotizaron).
  if (nextStatus === "quote_requested") {
    throw new AppError(400, 'No se puede volver a "Pendiente de cotizar"', undefined, "FORCE_STATUS_NOT_ALLOWED");
  }

  // Estado + evento + (salida de almacén): todo o nada.
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const current = await DataBase.instance.quotation.findOne({
      where: { id: quotationId, is_deleted: false },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!current) throw new AppError(404, "La cotización no existe", undefined, "NOT_FOUND");

    const currentStatus = current.status;
    if (currentStatus === nextStatus) {
      throw new AppError(400, `La cotización ya está en "${QUOTATION_STATUS_LABEL[nextStatus]}"`, undefined, "SAME_STATUS");
    }

    const blockedAction = MONEY_BLOCKED_TARGETS[nextStatus];
    if (blockedAction) await assertNoMoneyInvolved(current, blockedAction, transaction);

    // Un pedido de la web que sale a cualquier estado que no sea Rechazada
    // debe estar completo (técnica y precio en cada producto), igual que al
    // pasarlo a Pendiente en el flujo normal.
    if (currentStatus === "quote_requested" && nextStatus !== "rejected") {
      await assertRequestedQuotationIsComplete(quotationId, transaction);
    }

    // Al volver a Pendiente se le da una vigencia nueva: con la vieja (ya
    // pasada) el job de vencimiento la cerraría en la siguiente hora.
    const now = nowUtc();
    const validUntil = nextStatus === "pending" ? await computeDefaultValidUntil(now, current.company_id) : undefined;

    await DataBase.instance.quotation.update(
      {
        status: nextStatus,
        status_changed_at: now,
        updated_by: actorId,
        updated_at: now,
        ...(validUntil ? { valid_until: validUntil } : {}),
      },
      { where: { id: quotationId }, transaction }
    );

    const reason = note?.trim();
    await logQuotationEvent({
      quotationId,
      action: "status_forced",
      description:
        `Estado cambiado a mano de "${QUOTATION_STATUS_LABEL[currentStatus]}" a "${QUOTATION_STATUS_LABEL[nextStatus]}"` +
        (reason ? `. Motivo: ${reason}` : ""),
      actorId,
      transaction,
    });

    const warnings: string[] = [];
    const leavesDelivery = DELIVERED_STATUSES.includes(currentStatus) && !DELIVERED_STATUSES.includes(nextStatus);
    const reachesDelivery = DELIVERED_STATUSES.includes(nextStatus);

    // Saltar directo a Entregada/Finalizada (sin pasar por la entrega) igual
    // descuenta el stock, como en el flujo normal. createDeliveryExit no
    // descuenta dos veces si ya hay una salida.
    if (reachesDelivery) {
      await createDeliveryExit({ quotation: current, actorId, transaction });
    }

    // Volver atrás desde una entrega NO devuelve la mercadería: si regresó al
    // almacén, se registra en Inventario (decisión de diseño: no adivinar).
    if (leavesDelivery && (await hasDeliveryExit(quotationId, transaction))) {
      warnings.push("La salida de almacén de la entrega no se revierte: si la mercadería volvió, regístrala en Inventario.");
    }

    // Finalizada por este camino no registra factura (podría duplicarla si ya
    // se había finalizado antes): si no tiene ninguna, se avisa.
    if (nextStatus === "finished" && !(await hasIssuedInvoice(quotationId, transaction))) {
      warnings.push("No se registró factura: si se emitió, regístrala en Facturas.");
    }

    return { status: nextStatus, warnings };
  });
}

import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { QUOTATION_STATUS_LABEL, QuotationStatus } from "../../model/quotation.model";

// Una cotización "activa" es la que el cliente aceptó y sigue su curso (de
// Aceptada a Finalizada). Solo ahí se registran pagos, gastos y compras, y
// se avanza la producción (pedido explícito del usuario: "una cotización que
// no fue aceptada no debería poder hacer nada referente a pagos o algo: solo
// se pueden avanzar cosas si está aceptada"). Una Pendiente cobra su
// adelanto al aceptarla (el cambio de estado y el pago van en la misma
// transacción); una Rechazada, Vencida o Cancelada ya está cerrada y el
// dinero quedaría colgado.
//
// Espejo en el frontend: QUOTATION_ACTIVE_STATUSES (grulla_fe quotation.types.ts).
export const ACTIVE_QUOTATION_STATUSES: QuotationStatus[] = [
  "accepted",
  "design_pending",
  "in_process",
  "ready",
  "delivered",
  "finished",
];

export class QuotationNotActiveError extends Error {}

// `action` completa el mensaje: "No se puede registrar un gasto: ...". Con
// `transaction`, la cotización se lee con lock (FOR UPDATE): serializa contra
// un cambio de estado simultáneo, que toma el mismo lock, así no se cuela un
// pago o un gasto en una cotización que se está cancelando.
export const assertQuotationIsActive = async (
  quotationId: number,
  action: string,
  transaction?: Transaction
): Promise<void> => {
  const quotation = await DataBase.instance.quotation.findOne({
    where: { id: quotationId },
    attributes: ["id", "status"],
    transaction,
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
  });
  if (!quotation) throw new Error("La cotización no existe");
  if (ACTIVE_QUOTATION_STATUSES.includes(quotation.status)) return;

  const reason =
    quotation.status === "pending"
      ? "la cotización todavía no fue aceptada"
      : `la cotización está "${QUOTATION_STATUS_LABEL[quotation.status]}"`;
  throw new QuotationNotActiveError(`No se puede ${action}: ${reason}.`);
};

import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { computeQuotationTotal, QUOTATION_STATUS_LABEL, QuotationAttributes, QuotationStatus } from "../../model/quotation.model";
import { logQuotationEvent } from "../timeline/quotation_event.service";
import { getIgvRate } from "../shared/tax_config";
import { CreateQuotationPaymentInput, insertQuotationPayment } from "../create/quotation_payment.service";

// Solo al aceptar se puede registrar un adelanto junto con el cambio de
// estado (pedido explícito del usuario: al pasar a "Aceptada" preguntar si
// el cliente pagó adelanto).
export class AdvanceOnlyOnAcceptError extends Error {}

// Cadena principal del flujo (flujo de estados, ver flujo de cotizacion +
// estados.pdf). Desde cualquier punto de la cadena se puede avanzar al
// siguiente O retroceder al anterior — nunca saltar más de un paso — más
// las salidas de excepción del diagrama original (rechazada solo desde
// pending; cancelada desde accepted/design_pending/in_process).
// rejected/expired/cancelled/finished no tienen salida: son finales.
//
// "expired" NO está en esta lista a propósito: vencer una cotización no es
// una decisión manual de un usuario, es automático según `valid_until`
// (ver services/jobs/expireQuotations.job.ts, que actualiza el estado
// directo sin pasar por este mapa de transiciones "elegibles a mano").
const MAIN_CHAIN: QuotationStatus[] = [
  "pending",
  "accepted",
  "design_pending",
  "in_process",
  "ready",
  "delivered",
  "finished",
];

const EXIT_TRANSITIONS: Partial<Record<QuotationStatus, QuotationStatus[]>> = {
  pending: ["rejected"],
  accepted: ["cancelled"],
  design_pending: ["cancelled"],
  in_process: ["cancelled"],
};

const buildAllowedTransitions = (): Record<QuotationStatus, QuotationStatus[]> => {
  const map = {} as Record<QuotationStatus, QuotationStatus[]>;

  MAIN_CHAIN.forEach((status, index) => {
    const steps: QuotationStatus[] = [];
    if (index > 0) steps.push(MAIN_CHAIN[index - 1]!);
    if (index < MAIN_CHAIN.length - 1) steps.push(MAIN_CHAIN[index + 1]!);
    map[status] = [...steps, ...(EXIT_TRANSITIONS[status] ?? [])];
  });

  map.rejected = [];
  map.expired = [];
  map.cancelled = [];
  map.finished = [];

  return map;
};

export const ALLOWED_TRANSITIONS = buildAllowedTransitions();

export class InvalidTransitionError extends Error {}
export class QuotationHasMoneyInvolvedError extends Error {}

// Antes nada impedía rechazar o cancelar una cotización que YA tenía dinero
// cobrado (total_paid > 0) o compras reales hechas (purchase_order_item_
// purchase) — el dinero/las compras quedaban "colgados" en una cotización
// cerrada, sin ningún aviso, hasta que alguien lo notara en una auditoría
// manual. Rechazar/cancelar con plata o compras de por medio exige primero
// resolver eso (anular los pagos, revisar las compras) — nunca es automático.
const assertNoMoneyInvolved = async (quotationId: number) => {
  const quotation = await DataBase.instance.quotation.findOne({ where: { id: quotationId } });
  if (!quotation) throw new Error("La cotización no existe");

  if (Number(quotation.total_paid) > 0) {
    throw new QuotationHasMoneyInvolvedError(
      "No se puede rechazar/cancelar: esta cotización ya tiene pagos registrados. Anula los pagos primero."
    );
  }

  const [purchaseRow] = (await DataBase.instance.sequelize.query(
    `SELECT COUNT(*) AS total
     FROM purchase_order_item_purchase poip
     INNER JOIN purchase_order_item poi ON poi.id = poip.purchase_order_item_id
     INNER JOIN purchase_order po ON po.id = poi.purchase_order_id
     WHERE po.quotation_id = :quotationId`,
    { type: QueryTypes.SELECT, replacements: { quotationId } }
  )) as { total: number }[];

  if (Number(purchaseRow?.total ?? 0) > 0) {
    throw new QuotationHasMoneyInvolvedError(
      "No se puede rechazar/cancelar: esta cotización ya tiene compras reales registradas en una orden de compra."
    );
  }
};

const updateQuotationById = async ({
  quotation,
  quotationId,
  updatedBy,
}: {
  quotation: {
    notes?: string | null;
    valid_until?: string | null;
    includes_delivery?: boolean;
    includes_design?: boolean;
    includes_igv?: boolean;
    billing_name?: string | null;
    billing_document_number?: string | null;
    production_days?: number | null;
  };
  quotationId: number;
  updatedBy?: number;
}) => {
  // Whitelist explícita — nunca `{...quotation}` directo. `quotation` viene
  // de `req.body` sin tipar de verdad en runtime (el tipo del parámetro es
  // solo chequeo de compilación); sin esto, el dueño de una cotización
  // propia podía mandar `company_id`/`business_unit_id`/`client_id`/
  // `status`/`total`/`total_paid` en el body de `PUT /quotation/update/:id`
  // y "mudar" la cotización (con su cliente, pagos y gastos vinculados) a
  // otra empresa, o falsear sus montos sin pasar por recalculateTotalPaid
  // ni por la máquina de estados de changeQuotationStatus.
  const updateData: Partial<QuotationAttributes> = {
    notes: quotation.notes,
    valid_until: quotation.valid_until,
    includes_delivery: quotation.includes_delivery,
    includes_design: quotation.includes_design,
    includes_igv: quotation.includes_igv,
    billing_name: quotation.billing_name,
    billing_document_number: quotation.billing_document_number,
    production_days: quotation.production_days,
    updated_by: updatedBy,
    updated_at: nowUtc(),
  };

  // Escribe en 2 tablas (quotation, quotation_event) — se envuelve en una
  // transacción para que no quede un evento de timeline "huérfano" si la
  // actualización de la cotización fallara (o viceversa).
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    // Si cambia includes_igv, el total se recalcula desde el subtotal ya
    // guardado (los items de una cotización ya creada no se vuelven a editar
    // en este flujo, así que no hace falta re-sumarlos).
    if (typeof quotation.includes_igv === "boolean") {
      const current = await DataBase.instance.quotation.findOne({ where: { id: quotationId }, transaction });
      if (!current) throw new Error("La cotización no existe");
      const igvRate = await getIgvRate(current.company_id);
      updateData.total = computeQuotationTotal(Number(current.subtotal), quotation.includes_igv, igvRate);
    }

    const result = await DataBase.instance.quotation.update(updateData, { where: { id: quotationId }, transaction });

    await logQuotationEvent({
      quotationId,
      action: "updated",
      description: "Se actualizaron los datos de la cotización",
      actorId: updatedBy,
      transaction,
    });

    return result;
  });
};

const changeQuotationStatus = async ({
  quotationId,
  nextStatus,
  updatedBy,
  advancePayment,
}: {
  quotationId: number;
  nextStatus: QuotationStatus;
  updatedBy?: number;
  // Adelanto opcional que se registra en la MISMA transacción del cambio de
  // estado: si el pago falla (sobre-pago, cuenta inválida), la cotización
  // no queda aceptada a medias.
  advancePayment?: CreateQuotationPaymentInput;
}) => {
  if (advancePayment && nextStatus !== "accepted") {
    throw new AdvanceOnlyOnAcceptError("El adelanto solo se puede registrar al aceptar la cotización");
  }

  const current = await DataBase.instance.quotation.findOne({ where: { id: quotationId } });
  if (!current) throw new Error("La cotización no existe");

  const currentStatus = current.status;
  const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? [];

  if (!allowed.includes(nextStatus)) {
    throw new InvalidTransitionError(
      `No se puede pasar de "${currentStatus}" a "${nextStatus}". Transiciones válidas: ${allowed.join(", ") || "ninguna (estado final)"}`
    );
  }

  if (nextStatus === "rejected" || nextStatus === "cancelled") {
    await assertNoMoneyInvolved(quotationId);
  }

  // Escribe en 2 tablas (quotation, quotation_event) — y, con adelanto, también
  // en quotation_payment — todo o nada.
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const result = await DataBase.instance.quotation.update(
      { status: nextStatus, updated_by: updatedBy, updated_at: nowUtc() },
      { where: { id: quotationId }, transaction }
    );

    await logQuotationEvent({
      quotationId,
      action: "status_changed",
      description: `Estado cambiado de "${QUOTATION_STATUS_LABEL[currentStatus]}" a "${QUOTATION_STATUS_LABEL[nextStatus]}"`,
      actorId: updatedBy,
      transaction,
    });

    if (advancePayment) {
      await insertQuotationPayment({
        quotationId,
        input: { ...advancePayment, notes: advancePayment.notes?.trim() || "Adelanto" },
        createdBy: updatedBy,
        transaction,
        isAdvance: true,
      });
    }

    return result;
  });
};

export { updateQuotationById, changeQuotationStatus };
